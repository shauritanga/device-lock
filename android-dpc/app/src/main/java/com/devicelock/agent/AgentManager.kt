package com.devicelock.agent

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.telephony.TelephonyManager
import android.util.Base64
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Executors
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Bridges the backend command pipeline to on-device policy. It enrolls, checks
 * in, executes LOCK / UNLOCK via [DeviceLockController], and acks each command.
 *
 * Networking runs on a single background thread; results are delivered on the
 * main thread. Polling here is a simple foreground loop driven by the visible
 * activity — production would move this to WorkManager + FCM.
 */
class AgentManager(context: Context) {

    private val appContext = context.applicationContext
    private val store = AgentStore(appContext)
    private val controller = DeviceLockController(appContext)
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    /** Summary of the outcome of a check-in, for display on the staff screen. */
    data class CheckinOutcome(val executed: List<String>, val message: String)
    data class SummaryOutcome(val summary: BuyerSummary, val cached: Boolean, val updatedAt: Long)

    fun isEnrolled() = store.isEnrolled
    fun baseUrl() = store.baseUrl
    fun deviceId() = store.deviceId
    fun isLocked() = controller.isLocked()

    /** Test recovery: forget a backend binding that no longer exists. */
    fun forgetEnrollment() = store.clear()

    /** Enroll with the backend using a staff-issued enrollment token (async UI). */
    fun enroll(
        enrollmentToken: String,
        onResult: (Result<String>) -> Unit,
    ) {
        io.execute {
            val result = runCatching { performEnroll(enrollmentToken) }
            main.post { onResult(result) }
        }
    }

    /**
     * Blocking enrollment: exchange the enrollment token for a per-device token,
     * lock down anti-removal, and start the background check-in loop. Throws on
     * failure. Call off the main thread (UI path, or [EnrollWorker] for the
     * zero-touch / QR provisioning flow). Idempotent-ish: a second call just
     * re-enrolls and overwrites the stored token.
     */
    fun performEnroll(enrollmentToken: String): String {
        val res = AgentApi.enroll(
            baseUrl = store.baseUrl,
            enrollmentToken = enrollmentToken.trim(),
            imei = deviceImei(),
            make = android.os.Build.MANUFACTURER,
            model = android.os.Build.MODEL,
            fcmToken = store.fcmToken,
            simInfo = readSimInfo(),
        )
        store.agentToken = res.agentToken
        store.deviceId = res.deviceId
        store.smsSecret = res.smsSecret
        res.policy?.let { cachePolicy(it) }
        store.lastSuccessfulCheckinAt = System.currentTimeMillis()
        // Enrolled = managed. Lock down anti-removal for the life of the loan
        // and start the reliable background check-in loop.
        controller.applyManagedRestrictions()
        AgentSync.schedulePeriodic(appContext)
        AgentMessagingService.refreshToken(appContext)
        return "Enrolled as ${res.deviceId}"
    }

    /**
     * One check-in cycle on the caller's thread: pull pending commands, execute
     * each, ack the outcome. Blocking — call from a background thread / Worker.
     * Throws if not enrolled or the network fails.
     */
    fun performCheckin(currentlyLocked: Boolean): CheckinOutcome {
        val token = store.agentToken
            ?: throw IllegalStateException("Not enrolled")

        val lockState = if (currentlyLocked) "LOCKED" else "UNLOCKED"
        val checkin = AgentApi.checkin(
            store.baseUrl,
            token,
            lockState,
            store.fcmToken,
            controller.isDeviceOwner(),
            controller.managedRestrictionsApplied(),
            readSimInfo(),
        )
        store.lastSuccessfulCheckinAt = System.currentTimeMillis()
        checkin.smsSecret?.let { store.smsSecret = it }
        checkin.policy?.let { cachePolicy(it) }
        runCatching { refreshSummaryCache(token) }
        val executed = ArrayList<String>()
        for (cmd in checkin.commands) {
            val outcome = runCatching { execute(cmd) }
            if (outcome.isSuccess) {
                executed.add(cmd.type)
                AgentApi.ack(store.baseUrl, token, cmd.id, "DONE", null)
            } else {
                AgentApi.ack(
                    store.baseUrl, token, cmd.id, "FAILED",
                    outcome.exceptionOrNull()?.message,
                )
            }
        }
        return CheckinOutcome(
            executed = executed,
            message = if (executed.isEmpty()) {
                "Checked in — no commands"
            } else {
                "Executed: ${executed.joinToString(", ")}"
            },
        )
    }

    /**
     * Async check-in used by the foreground screens; delivers the result on the
     * main thread. Background delivery goes through [CheckinWorker] instead.
     */
    fun checkinNow(
        currentlyLocked: Boolean,
        onResult: (Result<CheckinOutcome>) -> Unit,
    ) {
        io.execute {
            val result = runCatching { performCheckin(currentlyLocked) }
            main.post { onResult(result) }
        }
    }

    fun fetchCustomerSummary(onResult: (Result<SummaryOutcome>) -> Unit) {
        io.execute {
            val result = runCatching {
                val token = store.agentToken ?: throw IllegalStateException("Not enrolled")
                try {
                    val summary = AgentApi.customerSummary(store.baseUrl, token)
                    store.cachedSummaryJson = summary.rawJson
                    store.cachedSummaryAt = System.currentTimeMillis()
                    cacheDueState(summary)
                    SummaryOutcome(summary, cached = false, updatedAt = store.cachedSummaryAt)
                } catch (e: Exception) {
                    val cached = store.cachedSummaryJson ?: throw e
                    SummaryOutcome(
                        AgentApi.parseBuyerSummary(JSONObject(cached)),
                        cached = true,
                        updatedAt = store.cachedSummaryAt,
                    )
                }
            }
            main.post { onResult(result) }
        }
    }

    fun payNow(amount: Double?, phoneNumber: String?, onResult: (Result<PayNowResult>) -> Unit) {
        io.execute {
            val result = runCatching {
                val token = store.agentToken ?: throw IllegalStateException("Not enrolled")
                AgentApi.payNow(store.baseUrl, token, amount, phoneNumber)
            }
            main.post { onResult(result) }
        }
    }

    fun enforceOfflinePolicy(): String? {
        if (!store.isEnrolled || controller.isLocked() || !controller.isDeviceOwner()) return null

        val now = System.currentTimeMillis()
        val lastCheckin = store.lastSuccessfulCheckinAt
        if (lastCheckin > 0L && now - lastCheckin > store.maxOfflineDays.toLong() * DAY_MS) {
            controller.lock()
            return "offline for more than ${store.maxOfflineDays} day(s)"
        }

        val dueAt = store.nextDueAt
        if (dueAt > 0L && store.nextAmountDue > 0f && now > dueAt + store.graceDays.toLong() * DAY_MS) {
            controller.lock()
            return "cached installment overdue past grace period"
        }
        return null
    }

    fun handleSmsCommand(message: String): Boolean {
        val parsed = parseSmsCommand(message) ?: return false
        val secret = store.smsSecret ?: return false
        if (System.currentTimeMillis() > parsed.expiresAt) return false
        if (store.usedSmsCommandIds.contains(parsed.commandId)) return false

        val payload = "DL1|${parsed.commandId}|${parsed.type}|${parsed.expiresAt}"
        val expected = hmac(payload, secret).take(32)
        if (!constantTimeEquals(expected, parsed.signature)) return false

        execute(AgentCommand(parsed.commandId, parsed.type, "sms fallback"))
        store.usedSmsCommandIds = store.usedSmsCommandIds + parsed.commandId

        val token = store.agentToken
        if (token != null) {
            runCatching {
                AgentApi.ack(store.baseUrl, token, parsed.commandId, "DONE", "executed via signed SMS")
            }
        }
        return true
    }

    /** Apply a single command's on-device effect. */
    private fun execute(cmd: AgentCommand) {
        runOnMain {
            when (cmd.type) {
                "LOCK" -> controller.lock()
                "UNLOCK" -> controller.unlock()
                // Release is only ever sent by the backend once the loan is settled
                // (or an owner forces it). The device has no local authority to
                // release itself — see MainActivity.
                "RELEASE" -> controller.releaseDevice()
                else -> throw IllegalArgumentException("Unknown command ${cmd.type}")
            }
        }
    }

    /**
     * Lock-task / startActivity must run on the main thread. If we are already
     * on main (foreground poll), run inline — posting+waiting would deadlock.
     */
    private fun runOnMain(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            block()
            return
        }
        val done = java.util.concurrent.CountDownLatch(1)
        var error: Throwable? = null
        main.post {
            try {
                block()
            } catch (t: Throwable) {
                error = t
            } finally {
                done.countDown()
            }
        }
        if (!done.await(15, java.util.concurrent.TimeUnit.SECONDS)) {
            throw IllegalStateException("Timed out applying command on main thread")
        }
        error?.let { throw it }
    }

    private fun parseSmsCommand(message: String): SmsCommand? {
        val parts = message.trim().split('|')
        if (parts.size != 5 || parts[0] != "DL1") return null
        val type = parts[2]
        if (type !in SMS_COMMAND_TYPES) return null
        val expiresAt = parts[3].toLongOrNull() ?: return null
        return SmsCommand(
            commandId = parts[1],
            type = type,
            expiresAt = expiresAt,
            signature = parts[4],
        )
    }

    private fun hmac(payload: String, secret: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(), "HmacSHA256"))
        return Base64.encodeToString(mac.doFinal(payload.toByteArray()), Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
    }

    private fun constantTimeEquals(a: String, b: String): Boolean {
        if (a.length != b.length) return false
        var diff = 0
        for (i in a.indices) diff = diff or (a[i].code xor b[i].code)
        return diff == 0
    }

    private fun cachePolicy(policy: DevicePolicy) {
        store.graceDays = policy.graceDays
        store.maxOfflineDays = policy.maxOfflineDays
    }

    private fun refreshSummaryCache(token: String) {
        val summary = AgentApi.customerSummary(store.baseUrl, token)
        store.cachedSummaryJson = summary.rawJson
        store.cachedSummaryAt = System.currentTimeMillis()
        cacheDueState(summary)
    }

    private fun cacheDueState(summary: BuyerSummary) {
        val next = summary.nextPayment
        if (summary.loan?.status != "ACTIVE" || next == null) {
            store.nextDueAt = 0L
            store.nextAmountDue = 0f
            return
        }
        store.nextDueAt = parseApiDate(next.dueDate)
        store.nextAmountDue = (next.amount - next.amountPaid).coerceAtLeast(0.0).toFloat()
    }

    private fun parseApiDate(value: String): Long = runCatching {
        val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
        parser.parse(value)?.time ?: 0L
    }.getOrDefault(0L)

    @Suppress("DEPRECATION")
    private fun readSimInfo(): SimInfo {
        val tm = appContext.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        return SimInfo(
            iccid = runCatching { tm.simSerialNumber }.getOrNull()?.takeIf { it.isNotBlank() },
            operator = runCatching { tm.simOperatorName }.getOrNull()?.takeIf { it.isNotBlank() },
            countryIso = runCatching { tm.simCountryIso }.getOrNull()?.takeIf { it.isNotBlank() },
            phoneNumber = runCatching { tm.line1Number }.getOrNull()?.takeIf { it.isNotBlank() },
        )
    }

    /** Stable per-device identifier used as the IMEI stand-in for the POC. */
    private fun deviceImei(): String =
        Settings.Secure.getString(appContext.contentResolver, Settings.Secure.ANDROID_ID)
            ?: "unknown-${android.os.Build.SERIAL}"

    private companion object {
        private const val DAY_MS = 24L * 60L * 60L * 1000L
        private val SMS_COMMAND_TYPES = setOf("LOCK", "UNLOCK", "RELEASE")
    }

    private data class SmsCommand(
        val commandId: String,
        val type: String,
        val expiresAt: Long,
        val signature: String,
    )
}

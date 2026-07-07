package com.devicelock.agent

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import java.util.concurrent.Executors

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

    fun isEnrolled() = store.isEnrolled
    fun baseUrl() = store.baseUrl
    fun deviceId() = store.deviceId
    fun isLocked() = controller.isLocked()

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
        )
        store.agentToken = res.agentToken
        store.deviceId = res.deviceId
        // Enrolled = managed. Lock down anti-removal for the life of the loan
        // and start the reliable background check-in loop.
        controller.applyManagedRestrictions()
        AgentSync.schedulePeriodic(appContext)
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
        val checkin = AgentApi.checkin(store.baseUrl, token, lockState, store.fcmToken)
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

    /** Apply a single command's on-device effect. */
    private fun execute(cmd: AgentCommand) {
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

    /** Stable per-device identifier used as the IMEI stand-in for the POC. */
    private fun deviceImei(): String =
        Settings.Secure.getString(appContext.contentResolver, Settings.Secure.ANDROID_ID)
            ?: "unknown-${android.os.Build.SERIAL}"
}

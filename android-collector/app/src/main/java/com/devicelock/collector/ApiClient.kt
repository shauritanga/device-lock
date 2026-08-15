package com.devicelock.collector

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

data class TokenPair(val accessToken: String, val refreshToken: String)

data class QueueCase(
    val id: String,
    val companyName: String?,
    val customerName: String?,
    val customerPhone: String?,
    val daysOverdue: Int,
    val amountDue: String,
    val currency: String,
    val status: String,
    val deviceImei: String?,
    val deviceModel: String?,
    val deviceStatus: String?,
    val dueDate: String?,
    val installmentSequence: Int?,
)

data class StartContactResult(
    val sessionId: String,
    val launchUrl: String?,
    val channel: String,
    val verificationNote: String?,
)

data class TodayPerformance(
    val callsCount: Int,
    val smsCount: Int,
    val whatsappCount: Int,
    val followUpsCount: Int,
    val talkSeconds: Int,
    val hoursWorkedSeconds: Int,
)

/**
 * Minimal HTTP client for staff collections APIs (no heavy OkHttp dependency).
 */
class ApiClient(
    private val baseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/'),
    private val store: SessionStore,
) {
    fun login(email: String, password: String): TokenPair {
        val body = JSONObject()
            .put("email", email.trim())
            .put("password", password)
        val json = request("POST", "/auth/login", body, auth = false)
        val pair = TokenPair(
            accessToken = json.getString("accessToken"),
            refreshToken = json.getString("refreshToken"),
        )
        store.accessToken = pair.accessToken
        store.refreshToken = pair.refreshToken
        store.email = email.trim()
        // decode role from me if needed
        runCatching {
            val me = request("GET", "/auth/me", null, auth = true)
            store.role = me.optString("role", null)
        }
        return pair
    }

    fun myQueue(): List<QueueCase> {
        val arr = requestArray("GET", "/collections/cases/mine")
        return (0 until arr.length()).map { i ->
            val o = arr.getJSONObject(i)
            QueueCase(
                id = o.getString("id"),
                companyName = o.optString("companyName", null).nullIfBlank(),
                customerName = o.optString("customerName", null).nullIfBlank(),
                customerPhone = o.optString("customerPhone", null).nullIfBlank(),
                daysOverdue = o.optInt("daysOverdue", 0),
                amountDue = o.opt("amountDue")?.toString() ?: "0",
                currency = o.optString("currency", "TZS"),
                status = o.optString("status", ""),
                deviceImei = o.optString("deviceImei", null).nullIfBlank(),
                deviceModel = o.optString("deviceModel", null).nullIfBlank(),
                deviceStatus = o.optString("deviceStatus", null).nullIfBlank(),
                dueDate = o.optString("dueDate", null).nullIfBlank(),
                installmentSequence = if (o.has("installmentSequence") && !o.isNull("installmentSequence")) {
                    o.optInt("installmentSequence")
                } else {
                    null
                },
            )
        }
    }

    fun getCase(id: String): JSONObject =
        request("GET", "/collections/cases/$id", null, auth = true)

    /** Today's collector performance (day period) for the signed-in user. */
    fun todayPerformance(): TodayPerformance {
        val json = request(
            "GET",
            "/collections/reports/collector-performance?period=day",
            null,
            auth = true,
        )
        val byCollector = json.optJSONArray("byCollector")
        if (byCollector != null && byCollector.length() > 0) {
            val row = byCollector.getJSONObject(0)
            return TodayPerformance(
                callsCount = row.optInt("callsCount", 0),
                smsCount = row.optInt("smsCount", 0),
                whatsappCount = row.optInt("whatsappCount", 0),
                followUpsCount = row.optInt("followUpsCount", 0),
                talkSeconds = row.optInt("talkSeconds", 0),
                hoursWorkedSeconds = row.optInt("hoursWorkedSeconds", 0),
            )
        }
        val totals = json.optJSONObject("totals")
        return TodayPerformance(
            callsCount = totals?.optInt("callsCount", 0) ?: 0,
            smsCount = 0,
            whatsappCount = 0,
            followUpsCount = totals?.optInt("followUpsCount", 0) ?: 0,
            talkSeconds = totals?.optInt("talkSeconds", 0) ?: 0,
            hoursWorkedSeconds = totals?.optInt("hoursWorkedSeconds", 0) ?: 0,
        )
    }

    fun startContact(caseId: String, channel: String, body: String? = null): StartContactResult {
        val payload = JSONObject().put("channel", channel)
        if (!body.isNullOrBlank()) payload.put("body", body)
        val json = request("POST", "/collections/cases/$caseId/contact-sessions", payload, auth = true)
        val session = json.getJSONObject("session")
        return StartContactResult(
            sessionId = session.getString("id"),
            launchUrl = json.optString("launchUrl", null).nullIfBlank(),
            channel = session.optString("channel", channel),
            verificationNote = json.optString("verificationNote", null).nullIfBlank(),
        )
    }

    fun submitProof(
        sessionId: String,
        logAtIso: String,
        durationSeconds: Int?,
        matchedPhone: String,
        direction: String = "OUTGOING",
        dialDurationSeconds: Int? = null,
    ): JSONObject {
        val payload = JSONObject()
            .put("logAt", logAtIso)
            .put("matchedPhone", matchedPhone)
            .put("direction", direction)
        if (durationSeconds != null) payload.put("durationSeconds", durationSeconds)
        val meta = JSONObject()
            .put("source", "android-collector")
            .put("matchedPhone", matchedPhone)
        if (dialDurationSeconds != null) meta.put("dialDurationSeconds", dialDurationSeconds)
        payload.put("deviceMatchMeta", meta)
        return request("POST", "/collections/contact-sessions/$sessionId/proof", payload, auth = true)
    }

    fun completeSelfReported(sessionId: String, note: String?): JSONObject {
        val payload = JSONObject()
            .put("verificationStatus", "SELF_REPORTED")
        if (!note.isNullOrBlank()) payload.put("outcomeNote", note)
        return request("POST", "/collections/contact-sessions/$sessionId/complete", payload, auth = true)
    }

    private fun requestArray(method: String, path: String): JSONArray {
        val text = raw(method, path, null, auth = true)
        return JSONArray(text)
    }

    private fun request(
        method: String,
        path: String,
        body: JSONObject?,
        auth: Boolean,
    ): JSONObject {
        val text = raw(method, path, body, auth)
        return JSONObject(text)
    }

    private fun raw(
        method: String,
        path: String,
        body: JSONObject?,
        auth: Boolean,
        retryOnUnauthorized: Boolean = true,
    ): String {
        val url = URL("$baseUrl$path")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 20_000
            readTimeout = 30_000
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json")
            if (auth) {
                val token = store.accessToken
                    ?: throw IllegalStateException("Not logged in")
                setRequestProperty("Authorization", "Bearer $token")
            }
            doInput = true
            if (body != null) {
                doOutput = true
                OutputStreamWriter(outputStream, Charsets.UTF_8).use { it.write(body.toString()) }
            }
        }
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val text = stream?.let { BufferedReader(InputStreamReader(it, Charsets.UTF_8)).readText() } ?: ""
        if (code !in 200..299) {
            if (code == HttpURLConnection.HTTP_UNAUTHORIZED && auth && retryOnUnauthorized) {
                if (refreshTokens()) {
                    return raw(method, path, body, auth, retryOnUnauthorized = false)
                }
                store.clear()
                throw RuntimeException("Unauthorized: session expired. Please sign in again.")
            }
            val msg = runCatching { JSONObject(text).optString("message", text) }.getOrDefault(text)
            throw RuntimeException(msg.ifBlank { "HTTP $code" })
        }
        return text
    }

    private fun refreshTokens(): Boolean {
        val refreshToken = store.refreshToken
            ?: return false
        return runCatching {
            val body = JSONObject().put("refreshToken", refreshToken)
            val json = request("POST", "/auth/refresh", body, auth = false)
            store.accessToken = json.getString("accessToken")
            store.refreshToken = json.getString("refreshToken")
        }.isSuccess
    }
}

private fun String?.nullIfBlank(): String? =
    if (this.isNullOrBlank() || this == "null") null else this

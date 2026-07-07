package com.devicelock.agent

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** A command the backend wants the agent to run. */
data class AgentCommand(val id: String, val type: String, val reason: String?)

/** Result of a successful enrollment. */
data class EnrollResult(val deviceId: String, val agentToken: String)

/** Result of a check-in: the commands to run this cycle. */
data class CheckinResult(val commands: List<AgentCommand>)

/**
 * Minimal client for the device-facing backend API (the agent routes), built on
 * [HttpURLConnection] + org.json so the agent pulls in no extra dependencies.
 *
 * All calls are blocking and must run off the main thread (see [AgentManager]).
 */
object AgentApi {

    private const val TIMEOUT_MS = 15_000

    /** POST /agent/enroll — exchange an enrollment token for a per-device token. */
    fun enroll(
        baseUrl: String,
        enrollmentToken: String,
        imei: String,
        make: String?,
        model: String?,
        fcmToken: String?,
    ): EnrollResult {
        val body = JSONObject()
            .put("enrollmentToken", enrollmentToken)
            .put("imei", imei)
        make?.let { body.put("make", it) }
        model?.let { body.put("model", it) }
        fcmToken?.let { body.put("fcmToken", it) }

        val json = post("$baseUrl/agent/enroll", body, bearer = null)
        return EnrollResult(
            deviceId = json.getString("deviceId"),
            agentToken = json.getString("agentToken"),
        )
    }

    /** POST /agent/checkin — heartbeat; returns any pending commands. */
    fun checkin(
        baseUrl: String,
        agentToken: String,
        lockState: String,
        fcmToken: String?,
    ): CheckinResult {
        val body = JSONObject().put("lockState", lockState)
        fcmToken?.let { body.put("fcmToken", it) }
        val json = post("$baseUrl/agent/checkin", body, bearer = agentToken)
        val arr: JSONArray = json.optJSONArray("commands") ?: JSONArray()
        val commands = ArrayList<AgentCommand>(arr.length())
        for (i in 0 until arr.length()) {
            val c = arr.getJSONObject(i)
            commands.add(
                AgentCommand(
                    id = c.getString("id"),
                    type = c.getString("type"),
                    reason = c.optString("reason", null),
                ),
            )
        }
        return CheckinResult(commands)
    }

    /** POST /agent/commands/:id/ack — report a command as DONE or FAILED. */
    fun ack(
        baseUrl: String,
        agentToken: String,
        commandId: String,
        result: String,
        detail: String?,
    ) {
        val body = JSONObject().put("result", result)
        detail?.let { body.put("detail", it) }
        post("$baseUrl/agent/commands/$commandId/ack", body, bearer = agentToken)
    }

    private fun post(urlStr: String, body: JSONObject, bearer: String?): JSONObject {
        val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = TIMEOUT_MS
            readTimeout = TIMEOUT_MS
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            bearer?.let { setRequestProperty("Authorization", "Bearer $it") }
        }
        try {
            conn.outputStream.use { it.write(body.toString().toByteArray()) }

            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()

            if (code !in 200..299) {
                throw IOException("HTTP $code: ${text.ifBlank { "no body" }}")
            }
            return if (text.isBlank()) JSONObject() else JSONObject(text)
        } finally {
            conn.disconnect()
        }
    }
}

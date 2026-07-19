package com.devicelock.agent

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** A command the backend wants the agent to run. */
data class AgentCommand(val id: String, val type: String, val reason: String?)

/** Result of a successful enrollment. */
data class DevicePolicy(val graceDays: Int, val maxOfflineDays: Int)
data class SimInfo(
    val iccid: String?,
    val operator: String?,
    val countryIso: String?,
    val phoneNumber: String?,
)
data class EnrollResult(val deviceId: String, val agentToken: String, val smsSecret: String?, val policy: DevicePolicy?)

/** Result of a check-in: the commands to run this cycle. */
data class CheckinResult(val commands: List<AgentCommand>, val smsSecret: String?, val policy: DevicePolicy?)

data class BuyerCustomer(val fullName: String, val phone: String, val nationalId: String?, val address: String?)
data class BuyerDevice(val imei: String, val serialNumber: String?, val make: String?, val model: String?, val status: String)
data class BuyerLoan(
    val principal: Double,
    val downPayment: Double,
    val totalRepayable: Double,
    val paidAmount: Double,
    val remainingAmount: Double,
    val overdueAmount: Double,
    val currency: String,
    val status: String,
    val startDate: String,
)
data class BuyerInstallment(
    val sequence: Int,
    val dueDate: String,
    val amount: Double,
    val amountPaid: Double,
    val status: String,
)
data class BuyerPayment(val amount: Double, val method: String, val status: String, val receivedAt: String)
data class PayNowResult(val paymentId: String?, val orderReference: String?, val status: String)
data class BuyerSummary(
    val customer: BuyerCustomer?,
    val device: BuyerDevice,
    val loan: BuyerLoan?,
    val nextPayment: BuyerInstallment?,
    val installments: List<BuyerInstallment>,
    val recentPayments: List<BuyerPayment>,
    val rawJson: String,
)

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
        simInfo: SimInfo,
    ): EnrollResult {
        val body = JSONObject()
            .put("enrollmentToken", enrollmentToken)
            .put("imei", imei)
        make?.let { body.put("make", it) }
        model?.let { body.put("model", it) }
        fcmToken?.let { body.put("fcmToken", it) }
        putSimInfo(body, simInfo)

        val json = post("$baseUrl/agent/enroll", body, bearer = null)
        return EnrollResult(
            deviceId = json.getString("deviceId"),
            agentToken = json.getString("agentToken"),
            smsSecret = json.optNullableString("smsSecret"),
            policy = parsePolicy(json.optJSONObject("policy")),
        )
    }

    /** POST /agent/checkin — heartbeat; returns any pending commands. */
    fun checkin(
        baseUrl: String,
        agentToken: String,
        lockState: String,
        fcmToken: String?,
        isDeviceOwner: Boolean,
        managedRestrictionsApplied: Boolean,
        simInfo: SimInfo,
    ): CheckinResult {
        val body = JSONObject()
            .put("lockState", lockState)
            .put("isDeviceOwner", isDeviceOwner)
            .put("managedRestrictionsApplied", managedRestrictionsApplied)
        fcmToken?.let { body.put("fcmToken", it) }
        putSimInfo(body, simInfo)
        val json = post("$baseUrl/agent/checkin", body, bearer = agentToken)
        val arr: JSONArray = json.optJSONArray("commands") ?: JSONArray()
        val commands = ArrayList<AgentCommand>(arr.length())
        for (i in 0 until arr.length()) {
            val c = arr.getJSONObject(i)
            commands.add(
                AgentCommand(
                    id = c.getString("id"),
                    type = c.getString("type"),
                    reason = c.optNullableString("reason"),
                ),
            )
        }
        return CheckinResult(commands, json.optNullableString("smsSecret"), parsePolicy(json.optJSONObject("policy")))
    }

    fun customerSummary(baseUrl: String, agentToken: String): BuyerSummary {
        return parseBuyerSummary(get("$baseUrl/agent/customer-summary", bearer = agentToken))
    }

    fun payNow(
        baseUrl: String,
        agentToken: String,
        amount: Double?,
        phoneNumber: String?,
    ): PayNowResult {
        val body = JSONObject()
        amount?.let { body.put("amount", it) }
        phoneNumber?.let { body.put("phoneNumber", it) }
        val json = post("$baseUrl/agent/pay-now", body, bearer = agentToken)
        return PayNowResult(
            paymentId = json.optNullableString("paymentId"),
            orderReference = json.optNullableString("orderReference"),
            status = json.optString("status", "PENDING"),
        )
    }

    fun parseBuyerSummary(json: JSONObject): BuyerSummary {
        val customerJson = json.optJSONObject("customer")
        val deviceJson = json.getJSONObject("device")
        val loanJson = json.optJSONObject("loan")
        val nextJson = json.optJSONObject("nextPayment")
        val installmentsJson = json.optJSONArray("installments") ?: JSONArray()
        val paymentsJson = json.optJSONArray("recentPayments") ?: JSONArray()

        val installments = ArrayList<BuyerInstallment>(installmentsJson.length())
        for (i in 0 until installmentsJson.length()) {
            installments.add(parseInstallment(installmentsJson.getJSONObject(i)))
        }
        val payments = ArrayList<BuyerPayment>(paymentsJson.length())
        for (i in 0 until paymentsJson.length()) {
            val p = paymentsJson.getJSONObject(i)
            payments.add(
                BuyerPayment(
                    amount = p.optDouble("amount"),
                    method = p.optString("method"),
                    status = p.optString("status"),
                    receivedAt = p.optString("receivedAt"),
                ),
            )
        }

        return BuyerSummary(
            customer = customerJson?.let {
                BuyerCustomer(
                    fullName = it.optString("fullName"),
                    phone = it.optString("phone"),
                    nationalId = it.optNullableString("nationalId"),
                    address = it.optNullableString("address"),
                )
            },
            device = BuyerDevice(
                imei = deviceJson.optString("imei"),
                serialNumber = deviceJson.optNullableString("serialNumber"),
                make = deviceJson.optNullableString("make"),
                model = deviceJson.optNullableString("model"),
                status = deviceJson.optString("status"),
            ),
            loan = loanJson?.let {
                BuyerLoan(
                    principal = it.optDouble("principal"),
                    downPayment = it.optDouble("downPayment"),
                    totalRepayable = it.optDouble("totalRepayable"),
                    paidAmount = it.optDouble("paidAmount"),
                    remainingAmount = it.optDouble("remainingAmount"),
                    overdueAmount = it.optDouble("overdueAmount"),
                    currency = it.optString("currency"),
                    status = it.optString("status"),
                    startDate = it.optString("startDate"),
                )
            },
            nextPayment = nextJson?.let { parseInstallment(it) },
            installments = installments,
            recentPayments = payments,
            rawJson = json.toString(),
        )
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

    private fun get(urlStr: String, bearer: String?): JSONObject {
        val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = TIMEOUT_MS
            readTimeout = TIMEOUT_MS
            bearer?.let { setRequestProperty("Authorization", "Bearer $it") }
        }
        try {
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

    private fun parseInstallment(json: JSONObject) = BuyerInstallment(
        sequence = json.optInt("sequence"),
        dueDate = json.optString("dueDate"),
        amount = json.optDouble("amount"),
        amountPaid = json.optDouble("amountPaid"),
        status = json.optString("status"),
    )

    private fun parsePolicy(json: JSONObject?): DevicePolicy? = json?.let {
        DevicePolicy(
            graceDays = it.optInt("graceDays", 3),
            maxOfflineDays = it.optInt("maxOfflineDays", 4),
        )
    }

    private fun putSimInfo(body: JSONObject, simInfo: SimInfo) {
        simInfo.iccid?.let { body.put("simIccid", it) }
        simInfo.operator?.let { body.put("simOperator", it) }
        simInfo.countryIso?.let { body.put("simCountryIso", it) }
        simInfo.phoneNumber?.let { body.put("simPhoneNumber", it) }
    }

    private fun JSONObject.optNullableString(name: String): String? =
        if (isNull(name)) null else optString(name).takeIf { it.isNotBlank() }
}

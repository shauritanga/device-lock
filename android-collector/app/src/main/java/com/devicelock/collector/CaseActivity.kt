package com.devicelock.collector

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.devicelock.collector.databinding.ActivityCaseBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

class CaseActivity : AppCompatActivity() {

    private lateinit var binding: ActivityCaseBinding
    private lateinit var store: SessionStore
    private lateinit var api: ApiClient

    private var caseId: String = ""
    private var customerPhone: String = ""
    private var pendingSessionId: String? = null
    private var pendingChannel: String? = null
    private var sessionStartedAt: Long = 0L
    private var currentCase: JSONObject? = null
    private var selectedTab = Tab.RECORDS

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityCaseBinding.inflate(layoutInflater)
        setContentView(binding.root)
        supportActionBar?.hide()

        store = SessionStore(this)
        api = ApiClient(store = store)
        caseId = intent.getStringExtra(EXTRA_CASE_ID).orEmpty()
        if (caseId.isBlank() || !store.isLoggedIn) {
            finish()
            return
        }

        binding.btnBack.setOnClickListener { finish() }
        binding.btnRefresh.setOnClickListener { loadCase() }
        binding.btnCall.setOnClickListener { startChannel("CALL") }
        binding.btnSms.setOnClickListener { startChannel("SMS") }
        binding.btnWhatsapp.setOnClickListener { startChannel("WHATSAPP") }
        binding.btnFullPayment.setOnClickListener { toast("Payment capture opens in the web console for now") }
        binding.btnPartialPay.setOnClickListener { toast("Partial payment capture opens in the web console for now") }
        binding.btnExtension.setOnClickListener { toast("Extension workflow opens in the web console for now") }
        binding.btnPreviousCase.setOnClickListener { toast("Previous/next queue navigation is not linked yet") }
        binding.btnNextCase.setOnClickListener { toast("Previous/next queue navigation is not linked yet") }

        binding.tabRecords.setOnClickListener { selectTab(Tab.RECORDS) }
        binding.tabCustomer.setOnClickListener { selectTab(Tab.CUSTOMER) }
        binding.tabContacts.setOnClickListener { selectTab(Tab.CONTACTS) }
        binding.tabRepayments.setOnClickListener { selectTab(Tab.REPAYMENTS) }

        loadCase()
    }

    private fun loadCase() {
        setLoading(true)
        lifecycleScope.launch {
            try {
                val json = withContext(Dispatchers.IO) { api.getCase(caseId) }
                currentCase = json
                bindCase(json)
                renderPanels(json)
            } catch (e: Exception) {
                toast(e.message ?: "Failed to load case")
                finish()
            } finally {
                setLoading(false)
            }
        }
    }

    private fun bindCase(json: JSONObject) {
        val currency = json.optString("currency", "TZS")
        val amountDue = json.opt("amountDue")?.toString() ?: "0"
        customerPhone = json.optString("customerPhone", "")

        binding.txtOrderNo.text = json.optString("loanId", caseId)
        binding.txtCaseNo.text = caseId.caseNumber()
        binding.txtProduct.text = json.optString("deviceModel", "").ifBlank {
            json.optString("companyName", "Device loan")
        }
        binding.txtOverdueDays.text = json.optInt("daysOverdue", 0).toString()
        binding.txtCollectionStatus.text = json.optString("status", "").prettyStatus()
        binding.txtDueDate.text = json.optString("dueDate", null).shortDateTime()
        binding.txtTotalLoan.text = formatMoney(currency, amountDue)
        binding.txtTotalRepaid.text = formatMoney(currency, "0")
        binding.txtDeviceStatus.text = json.optString("deviceStatus", "Unknown").prettyStatus()
        binding.txtCurrentDue.text = formatMoney(currency, amountDue)
        binding.txtDueHint.text = "Overdue ${json.optInt("daysOverdue", 0)} days. Follow up before close of day."

        binding.txtCustomer.text = "Customer Name (${json.optString("customerName", "Customer")})"
        binding.txtPhone.text = "Phone:${customerPhone.ifBlank { "--" }}"
        binding.txtWalletNo.text = customerPhone.ifBlank { "--" }
        binding.txtWhatsappNo.text = customerPhone.ifBlank { "--" }
        binding.txtWalletOperator.text = json.optString("companyName", "--")
    }

    private fun renderPanels(json: JSONObject) {
        renderRecords(json)
        renderCustomerInfo(json)
        renderContacts(json)
        renderRepayments(json)
        selectTab(selectedTab)
    }

    private fun renderRecords(json: JSONObject) {
        binding.panelRecords.removeAllViews()
        val timeline = json.optJSONArray("timeline") ?: JSONArray()
        val sessions = json.optJSONArray("sessions") ?: JSONArray()

        if (pendingSessionId != null) {
            binding.panelRecords.addView(actionRow())
        }

        if (timeline.length() == 0 && sessions.length() == 0) {
            binding.panelRecords.addView(emptyText("No collection records yet"))
            return
        }

        for (i in 0 until timeline.length()) {
            val row = timeline.optJSONObject(i) ?: continue
            val title = "Customer:${row.optString("channel", "Contact").prettyStatus()}(${row.optString("status", "Pending").prettyStatus()})"
            val time = row.optString("occurredAt", "").shortDateTime()
            val body = buildString {
                append(row.optString("body", "No remark").ifBlank { "No remark" })
                val phone = row.optString("customerPhone", "")
                if (phone.isNotBlank()) append("\nNumber: ").append(phone)
                val duration = row.opt("durationSeconds")?.toString()
                if (!duration.isNullOrBlank() && duration != "null") append(" Call duration: ").append(duration).append(" s")
                append(" Type: ").append(row.optString("direction", "Outgoing").prettyStatus())
            }
            binding.panelRecords.addView(recordCard(title, time, body))
        }

        if (timeline.length() == 0) {
            for (i in 0 until sessions.length()) {
                val row = sessions.optJSONObject(i) ?: continue
                val title = "Customer:${row.optString("channel", "Contact").prettyStatus()}(${row.optString("verificationStatus", "None").prettyStatus()})"
                val time = row.optString("initiatedAt", "").shortDateTime()
                val body = "Number: ${row.optString("customerPhone", "--")} Status: ${row.optString("status", "--").prettyStatus()}"
                binding.panelRecords.addView(recordCard(title, time, body))
            }
        }
    }

    private fun renderCustomerInfo(json: JSONObject) {
        binding.panelCustomer.removeAllViews()
        binding.panelCustomer.addView(sectionTitle("Customer details"))
        binding.panelCustomer.addView(infoRow("Customer ID", json.optString("customerId", "--")))
        binding.panelCustomer.addView(infoRow("Customer phone", json.optString("customerPhone", "--")))
        binding.panelCustomer.addView(infoRow("Company", json.optString("companyName", "--")))
        binding.panelCustomer.addView(infoRow("Assigned collector", json.optJSONObject("assignedTo")?.optString("fullName", "--") ?: "--"))
        binding.panelCustomer.addView(separator())
        binding.panelCustomer.addView(sectionTitle("Device information"))
        binding.panelCustomer.addView(infoRow("Device IMEI", json.optString("deviceImei", "--")))
        binding.panelCustomer.addView(infoRow("Device model", json.optString("deviceModel", "--")))
        binding.panelCustomer.addView(infoRow("Loan ID", json.optString("loanId", "--")))
    }

    private fun renderContacts(json: JSONObject) {
        binding.panelContacts.removeAllViews()
        val sessions = json.optJSONArray("sessions") ?: JSONArray()
        val primary = json.optString("customerPhone", "").ifBlank { "--" }
        binding.panelContacts.addView(sectionHeader("${sessions.length().coerceAtLeast(1)} contacts", "Send All SMS"))
        binding.panelContacts.addView(contactRow(primary, "Primary customer"))
        for (i in 0 until sessions.length()) {
            val row = sessions.optJSONObject(i) ?: continue
            val phone = row.optString("customerPhone", "")
            if (phone.isBlank()) continue
            if (phone != primary) {
                binding.panelContacts.addView(contactRow(phone, row.optString("channel", "Contact").prettyStatus()))
            }
        }
    }

    private fun renderRepayments(json: JSONObject) {
        binding.panelRepayments.removeAllViews()
        val promises = json.optJSONArray("promises") ?: JSONArray()
        if (promises.length() == 0) {
            binding.panelRepayments.addView(emptyText("No repayment or promise records yet"))
            return
        }
        for (i in 0 until promises.length()) {
            val row = promises.optJSONObject(i) ?: continue
            val title = "Order No.: ${json.optString("loanId", "--")}"
            val time = "Promise due: ${row.optString("dueDate", "").shortDateTime()}"
            val amount = formatMoney(row.optString("currency", json.optString("currency", "TZS")), row.opt("promisedAmount")?.toString() ?: "0")
            val body = "$time\nPromise status: ${row.optString("status", "--").prettyStatus()}\nPromise amount: $amount"
            binding.panelRepayments.addView(recordCard(title, row.optString("status", "").prettyStatus(), body))
        }
    }

    private fun selectTab(tab: Tab) {
        selectedTab = tab
        val tabs = listOf(binding.tabRecords, binding.tabCustomer, binding.tabContacts, binding.tabRepayments)
        tabs.forEach {
            it.setTextColor(Color.parseColor("#64748B"))
            it.setBackgroundColor(Color.TRANSPARENT)
        }
        val selected = when (tab) {
            Tab.RECORDS -> binding.tabRecords
            Tab.CUSTOMER -> binding.tabCustomer
            Tab.CONTACTS -> binding.tabContacts
            Tab.REPAYMENTS -> binding.tabRepayments
        }
        selected.setTextColor(Color.parseColor("#2F6DEB"))
        selected.setBackgroundResource(R.drawable.bg_tab_selected)

        binding.panelRecords.visibility = if (tab == Tab.RECORDS) View.VISIBLE else View.GONE
        binding.panelCustomer.visibility = if (tab == Tab.CUSTOMER) View.VISIBLE else View.GONE
        binding.panelContacts.visibility = if (tab == Tab.CONTACTS) View.VISIBLE else View.GONE
        binding.panelRepayments.visibility = if (tab == Tab.REPAYMENTS) View.VISIBLE else View.GONE
    }

    private fun startChannel(channel: String) {
        if (customerPhone.isBlank()) {
            toast("Customer has no phone number")
            return
        }
        setLoading(true)
        lifecycleScope.launch {
            try {
                val body = if (channel == "SMS" || channel == "WHATSAPP") {
                    "Hello, this is a reminder about your device installment. Please pay today."
                } else {
                    null
                }
                val result = withContext(Dispatchers.IO) {
                    api.startContact(caseId, channel, body)
                }
                pendingSessionId = result.sessionId
                pendingChannel = channel
                sessionStartedAt = System.currentTimeMillis()
                selectedTab = Tab.RECORDS
                currentCase?.let { renderPanels(it) }
                result.launchUrl?.let { openUrl(it) }
                result.verificationNote?.let { toast(it) }
            } catch (e: Exception) {
                toast(e.message ?: "Could not start contact")
            } finally {
                setLoading(false)
            }
        }
    }

    private fun openUrl(url: String) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            if (url.startsWith("tel:")) {
                intent.action = Intent.ACTION_DIAL
            }
            startActivity(intent)
        } catch (e: Exception) {
            toast("Could not open: ${e.message}")
        }
    }

    private fun verifyFromLogs() {
        val sessionId = pendingSessionId
        val channel = pendingChannel
        if (sessionId == null || channel == null) {
            toast("Start a contact first")
            return
        }
        if (channel == "WHATSAPP") {
            toast("WhatsApp cannot be verified from device logs. Use self-report.")
            return
        }
        val need = if (channel == "CALL") Manifest.permission.READ_CALL_LOG else Manifest.permission.READ_SMS
        if (ContextCompat.checkSelfPermission(this, need) != PackageManager.PERMISSION_GRANTED) {
            toast("Permission required: $need")
            return
        }

        setLoading(true)
        lifecycleScope.launch {
            try {
                val match = withContext(Dispatchers.IO) {
                    when (channel) {
                        "CALL" -> LogMatcher.findCallMatch(this@CaseActivity, customerPhone, sessionStartedAt)
                        "SMS" -> LogMatcher.findSmsMatch(this@CaseActivity, customerPhone, sessionStartedAt)
                        else -> null
                    }
                }
                if (match == null) {
                    toast("No matching outgoing $channel log found yet")
                    return@launch
                }
                withContext(Dispatchers.IO) {
                    api.submitProof(sessionId, match.logAtIso, match.durationSeconds, match.matchedPhone, match.direction)
                }
                pendingSessionId = null
                toast("Contact verified from device logs")
                loadCase()
            } catch (e: Exception) {
                toast(e.message ?: "Verify failed")
            } finally {
                setLoading(false)
            }
        }
    }

    private fun completeSelf() {
        val sessionId = pendingSessionId ?: run {
            toast("Start a contact first")
            return
        }
        setLoading(true)
        lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    api.completeSelfReported(sessionId, "Completed from collector app")
                }
                pendingSessionId = null
                toast("Marked complete")
                loadCase()
            } catch (e: Exception) {
                toast(e.message ?: "Complete failed")
            } finally {
                setLoading(false)
            }
        }
    }

    private fun actionRow(): LinearLayout {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 12.dp())
        }
        row.addView(actionMini("Verify from logs") { verifyFromLogs() })
        row.addView(actionMini("Self report") { completeSelf() }.apply {
            (layoutParams as LinearLayout.LayoutParams).marginStart = 10.dp()
        })
        return row
    }

    private fun actionMini(text: String, onClick: () -> Unit): TextView =
        TextView(this).apply {
            this.text = text
            gravity = Gravity.CENTER
            textSize = 14f
            setTextColor(Color.WHITE)
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setBackgroundResource(R.drawable.bg_page_selected)
            setOnClickListener { onClick() }
            layoutParams = LinearLayout.LayoutParams(0, 48.dp(), 1f)
        }

    private fun recordCard(title: String, meta: String, body: String): View {
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundResource(R.drawable.bg_record_card)
            setPadding(14.dp(), 12.dp(), 14.dp(), 12.dp())
        }
        card.addView(sectionHeader(title, meta))
        card.addView(TextView(this).apply {
            text = body
            setTextColor(Color.parseColor("#64748B"))
            textSize = 14f
            setLineSpacing(4f, 1f)
        })
        card.layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { bottomMargin = 12.dp() }
        return card
    }

    private fun sectionHeader(left: String, right: String): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(TextView(context).apply {
                text = left
                setTextColor(Color.parseColor("#1F2937"))
                textSize = 15f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
            }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            addView(TextView(context).apply {
                text = right
                setTextColor(Color.parseColor("#9AA4B2"))
                textSize = 13f
                gravity = Gravity.END
            }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 0.8f))
        }

    private fun sectionTitle(text: String): TextView =
        TextView(this).apply {
            this.text = text
            setTextColor(Color.parseColor("#1F2937"))
            textSize = 16f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setPadding(0, 0, 0, 10.dp())
        }

    private fun infoRow(label: String, value: String): TextView =
        TextView(this).apply {
            text = "$label\n$value"
            setTextColor(Color.parseColor("#1F2937"))
            textSize = 15f
            setLineSpacing(6f, 1f)
            setPadding(0, 8.dp(), 0, 12.dp())
        }

    private fun contactRow(phone: String, relation: String): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 12.dp(), 0, 12.dp())
        }
        row.addView(TextView(this).apply {
            text = "$phone\n$relation"
            setTextColor(Color.parseColor("#1F2937"))
            textSize = 15f
            setLineSpacing(4f, 1f)
        }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        row.addView(TextView(this).apply {
            text = "Call"
            setTextColor(Color.parseColor("#4F46E5"))
            textSize = 14f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setOnClickListener { startChannel("CALL") }
        })
        row.addView(TextView(this).apply {
            text = "  SMS"
            setTextColor(Color.parseColor("#4F46E5"))
            textSize = 14f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setOnClickListener { startChannel("SMS") }
        })
        return row
    }

    private fun separator(): View =
        View(this).apply {
            setBackgroundColor(Color.parseColor("#E9EDF3"))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1.dp()).apply {
                topMargin = 4.dp()
                bottomMargin = 14.dp()
            }
        }

    private fun emptyText(text: String): TextView =
        TextView(this).apply {
            this.text = text
            setTextColor(Color.parseColor("#64748B"))
            textSize = 15f
            gravity = Gravity.CENTER
            setPadding(0, 28.dp(), 0, 28.dp())
        }

    private fun setLoading(loading: Boolean) {
        binding.progress.visibility = if (loading) View.VISIBLE else View.GONE
    }

    private fun toast(msg: String) {
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
    }

    companion object {
        const val EXTRA_CASE_ID = "case_id"
    }

    private enum class Tab {
        RECORDS,
        CUSTOMER,
        CONTACTS,
        REPAYMENTS,
    }
}

private fun String.caseNumber(): String {
    val digits = filter { it.isDigit() }
    if (digits.length >= 5) return digits.takeLast(5)
    return take(5).uppercase()
}

private fun String.prettyStatus(): String =
    lowercase()
        .split('_', '-', ' ')
        .filter { it.isNotBlank() }
        .joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }
        .ifBlank { "In Progress" }

private fun String?.shortDateTime(): String {
    if (this.isNullOrBlank() || this == "null") return "--"
    return runCatching {
        val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
        val date = parser.parse(this)
        SimpleDateFormat("dd/MMM/yyyy HH:mm", Locale.ENGLISH).format(date!!)
    }.getOrElse {
        take(16).replace('T', ' ')
    }
}

private fun formatMoney(currency: String, raw: String): String {
    val value = raw.toDoubleOrNull() ?: 0.0
    val formatted = NumberFormat.getNumberInstance(Locale.US).format(value)
    return "$currency $formatted"
}

private fun Int.dp(): Int =
    (this * android.content.res.Resources.getSystem().displayMetrics.density).toInt()

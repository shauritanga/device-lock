package com.devicelock.collector

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.bumptech.glide.Glide
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
        // Recover an in-flight contact if the process died while the collector
        // was away (long call) — SessionStore persists it, unlike this field.
        if (store.pendingCaseId == caseId) {
            pendingSessionId = store.pendingSessionId
            pendingChannel = store.pendingChannel
            sessionStartedAt = store.pendingStartedAt
            customerPhone = store.pendingCustomerPhone.orEmpty()
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

    override fun onResume() {
        super.onResume()
        maybeShowCommunicationResultSheet()
    }

    /** Auto-opens the mandatory result sheet when returning from a call/WhatsApp. */
    private fun maybeShowCommunicationResultSheet() {
        val channel = pendingChannel ?: return
        if (channel != "CALL" && channel != "WHATSAPP") return
        showCommunicationResultSheet()
    }

    /** Shows the result sheet for whatever contact is pending, any channel. */
    private fun showCommunicationResultSheet() {
        val sessionId = pendingSessionId ?: return
        val channel = pendingChannel ?: return
        if (supportFragmentManager.findFragmentByTag(CommunicationResultSheet.TAG) != null) return
        CommunicationResultSheet.newInstance(
            sessionId = sessionId,
            caseId = caseId,
            channel = channel,
            customerPhone = customerPhone,
            sessionStartedAt = sessionStartedAt,
        ).apply {
            onSubmitted = {
                pendingSessionId = null
                pendingChannel = null
                currentCase?.let { renderPanels(it) }
                loadCase()
            }
        }.show(supportFragmentManager, CommunicationResultSheet.TAG)
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
        binding.txtCustomerBadge.text =
            if (json.optBoolean("isRepeatCustomer", false)) "Old customer" else "New customer"

        binding.txtExtensionApplied.text =
            if (json.optBoolean("extensionApplied", false)) "Yes" else "No"
        val penaltyAmount = json.opt("penaltyInterestAmount")?.toString() ?: "0"
        binding.txtPenaltyInterest.text = formatMoney(currency, penaltyAmount)

        val waiverValidUntil = json.optString("waiverValidUntil", null).nullIfBlank()
        if (waiverValidUntil != null) {
            val original = json.opt("originalOverdueAmount")?.toString()
            binding.txtWaiverNote.text = buildString {
                append("Waiver valid until ${waiverValidUntil.shortDateTime()}.")
                if (!original.isNullOrBlank() && original != "null") {
                    append(" Original overdue amount (${formatMoney(currency, original)}) restored if unpaid.")
                }
            }
            binding.txtWaiverNote.visibility = View.VISIBLE
        } else {
            binding.txtWaiverNote.visibility = View.GONE
        }
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
            binding.panelRecords.addView(pendingResultBanner())
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
                val occurredAt = row.optString("occurredAt", null).nullIfBlank()
                if (occurredAt != null) append(" Time: ").append(occurredAt.shortDateTime())
                val dialDuration = row.optJSONObject("metadata")
                    ?.opt("dialDurationSeconds")?.toString().nullIfBlank()
                if (dialDuration != null) append(" Dial duration: ").append(dialDuration).append(" s")
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

        val idCardUrl = json.optString("idCardPhotoUrl", null).nullIfBlank()
        val selfieUrl = json.optString("selfiePhotoUrl", null).nullIfBlank()
        if (idCardUrl != null) {
            binding.panelCustomer.addView(sectionTitle("ID card photo"))
            binding.panelCustomer.addView(kycPhoto(idCardUrl))
        }
        if (selfieUrl != null) {
            binding.panelCustomer.addView(sectionTitle("Selfie"))
            binding.panelCustomer.addView(kycPhoto(selfieUrl))
        }
        if (idCardUrl != null || selfieUrl != null) binding.panelCustomer.addView(separator())

        binding.panelCustomer.addView(sectionTitle("Work information"))
        binding.panelCustomer.addView(infoRow("Job / occupation", json.optString("occupation", null).nullIfBlank() ?: "--"))
        binding.panelCustomer.addView(infoRow("Company name", json.optString("employerName", null).nullIfBlank() ?: "--"))
        binding.panelCustomer.addView(infoRow("Company phone", json.optString("employerPhone", null).nullIfBlank() ?: "--"))
        val income = json.opt("monthlyIncome")?.toString().nullIfBlank()
        binding.panelCustomer.addView(
            infoRow("Monthly income", if (income != null) formatMoney(json.optString("currency", "TZS"), income) else "--"),
        )
        binding.panelCustomer.addView(separator())

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

    private fun kycPhoto(url: String): ImageView =
        ImageView(this).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                160.dp(),
            ).apply { bottomMargin = 12.dp() }
            Glide.with(this@CaseActivity).load(url).into(this)
        }

    private fun renderContacts(json: JSONObject) {
        binding.panelContacts.removeAllViews()
        val sessions = json.optJSONArray("sessions") ?: JSONArray()
        val timeline = json.optJSONArray("timeline") ?: JSONArray()
        val primary = json.optString("customerPhone", "").ifBlank { "--" }

        fun lastContactFor(phone: String): String? {
            for (i in 0 until timeline.length()) {
                val row = timeline.optJSONObject(i) ?: continue
                if (row.optString("customerPhone", "") == phone) {
                    return row.optString("occurredAt", null).nullIfBlank()
                }
            }
            return null
        }

        binding.panelContacts.addView(sectionHeader("${sessions.length().coerceAtLeast(1)} contacts", "Send All SMS"))
        binding.panelContacts.addView(
            contactRow(primary, "Primary customer", lastContactFor(primary)),
        )
        for (i in 0 until sessions.length()) {
            val row = sessions.optJSONObject(i) ?: continue
            val phone = row.optString("customerPhone", "")
            if (phone.isBlank()) continue
            if (phone != primary) {
                binding.panelContacts.addView(
                    contactRow(phone, row.optString("channel", "Contact").prettyStatus(), lastContactFor(phone)),
                )
            }
        }
    }

    private fun renderRepayments(json: JSONObject) {
        binding.panelRepayments.removeAllViews()
        val repayments = json.optJSONArray("repayments") ?: JSONArray()
        if (repayments.length() == 0) {
            binding.panelRepayments.addView(emptyText("No repayment records yet"))
            return
        }
        val currency = json.optString("currency", "TZS")
        for (i in 0 until repayments.length()) {
            val row = repayments.optJSONObject(i) ?: continue
            val title = "Order No.: ${row.optString("orderReference", "--")}"
            val classification = row.optString("classification", "PARTIAL")
            val badge = if (classification == "FULL") "Full payment" else "Partial"
            val time = "Repayment time: ${row.optString("receivedAt", "").shortDateTime()}"
            val amount = formatMoney(currency, row.opt("amount")?.toString() ?: "0")
            val daysEarly = row.opt("daysEarly")?.toString()?.toIntOrNull()
            val statusLine = when {
                daysEarly == null -> ""
                daysEarly >= 0 -> "\nRepayment status: $daysEarly days early"
                else -> "\nRepayment status: ${-daysEarly} days late"
            }
            val body = "$time$statusLine\nRepayment amount: $amount"
            binding.panelRepayments.addView(recordCard(title, badge, body))
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
                store.savePendingContact(
                    sessionId = result.sessionId,
                    caseId = caseId,
                    channel = channel,
                    customerPhone = customerPhone,
                    startedAt = sessionStartedAt,
                )
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

    /**
     * Banner shown while a contact is pending. The result sheet already opens
     * automatically on resume for CALL/WHATSAPP; this is the manual fallback
     * (e.g. for SMS, or if the auto-open was somehow missed).
     */
    private fun pendingResultBanner(): LinearLayout {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 12.dp())
        }
        row.addView(actionMini("Log collection result") { showCommunicationResultSheet() })
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

    private fun contactRow(phone: String, relation: String, lastContactedAt: String? = null): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 12.dp(), 0, 12.dp())
        }
        val status = if (lastContactedAt != null) "Last contact: ${lastContactedAt.shortDateTime()}" else "Never contacted"
        row.addView(TextView(this).apply {
            text = "$phone  $relation\n$status"
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

private fun String?.nullIfBlank(): String? =
    if (this.isNullOrBlank() || this == "null") null else this

private fun Int.dp(): Int =
    (this * android.content.res.Resources.getSystem().displayMetrics.density).toInt()

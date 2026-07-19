package com.devicelock.agent

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.devicelock.agent.databinding.ActivityMainBinding
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Device screen. Its behaviour depends on state:
 *  - Not enrolled  -> one-time staff setup, gated behind a staff PIN. Enrolment
 *    is all a staff member can do; there are no lock/unlock controls here.
 *  - Enrolled      -> a read-only "managed" notice. Nothing on this screen lets
 *    the person holding the device change its lock state; only the backend can.
 *
 * While visible it also polls in the foreground for snappy command delivery;
 * background delivery continues via FCM + [CheckinWorker] when it isn't.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var controller: DeviceLockController
    private lateinit var agent: AgentManager
    private var latestSummary: BuyerSummary? = null
    private val money = NumberFormat.getNumberInstance(Locale.US)
    private val dateFormat = SimpleDateFormat("dd MMM yyyy", Locale.US)

    private val poll = Handler(Looper.getMainLooper())
    private val pollRunnable = object : Runnable {
        override fun run() {
            if (agent.isEnrolled()) checkinSilently()
            poll.postDelayed(this, POLL_INTERVAL_MS)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        supportActionBar?.hide()

        controller = DeviceLockController(this)
        agent = AgentManager(this)
        AgentMessagingService.refreshToken(applicationContext)

        binding.btnRefresh.setOnClickListener { refreshStatus() }
        binding.btnStaffUnlock.setOnClickListener { unlockStaff() }
        binding.btnEnroll.setOnClickListener { enroll() }
        binding.btnRelease.setOnClickListener { requestRelease() }
        binding.btnDebugRelease.setOnClickListener { requestDebugRelease() }
        binding.btnNotifications.setOnClickListener { toast("No new notifications") }
        binding.btnPayNow.setOnClickListener { payNowFromSummary() }
        binding.bottomNav.setOnItemSelectedListener {
            showPage(it.itemId)
            true
        }

        // Ensure anti-removal restrictions are in force for any managed device
        // (covers devices enrolled before this became automatic).
        if (controller.isDeviceOwner()) controller.applyManagedRestrictions()
        if (agent.isEnrolled()) AgentSync.schedulePeriodic(applicationContext)

        refreshStatus()
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
        poll.postDelayed(pollRunnable, POLL_INTERVAL_MS)
    }

    override fun onPause() {
        super.onPause()
        poll.removeCallbacks(pollRunnable)
    }

    /** Reveal staff actions (enroll or release) only on the correct staff PIN. */
    private fun unlockStaff() {
        val pin = binding.inputPin.text.toString()
        if (pin == BuildConfig.STAFF_PIN) {
            binding.staffActions.visibility = View.VISIBLE
            refreshStatus()
        } else {
            toast(getString(R.string.staff_pin_wrong))
        }
    }

    /**
     * Ask the backend to release this device. Staff have NO local authority to
     * release: this only checks in and executes a RELEASE the server has already
     * authorized (loan fully paid, or an owner forced it from the dashboard).
     * If nothing is authorized, the device stays managed.
     */
    private fun requestRelease() {
        AlertDialog.Builder(this)
            .setTitle(R.string.release_confirm_title)
            .setMessage(R.string.release_confirm_msg)
            .setPositiveButton(android.R.string.ok) { _, _ ->
                if (!agent.isEnrolled()) {
                    toast(getString(R.string.release_not_enrolled))
                    return@setPositiveButton
                }
                toast(getString(R.string.release_checking))
                agent.checkinNow(currentlyLocked = controller.isLocked()) { result ->
                    result
                        .onSuccess {
                            val released = it.executed.contains("RELEASE")
                            toast(
                                getString(
                                    if (released) R.string.release_done
                                    else R.string.release_not_authorized,
                                ),
                            )
                            refreshStatus()
                        }
                        .onFailure { toast(it.message ?: "Release check failed") }
                }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    /**
     * Debug-only recovery for local testing when the backend rows were deleted
     * before the managed phone was released. Never present in release builds.
     */
    private fun requestDebugRelease() {
        if (!BuildConfig.DEBUG) return
        AlertDialog.Builder(this)
            .setTitle(R.string.debug_release_title)
            .setMessage(R.string.debug_release_msg)
            .setPositiveButton(android.R.string.ok) { _, _ ->
                controller.releaseDevice()
                agent.forgetEnrollment()
                toast(getString(R.string.release_done))
                refreshStatus()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun enroll() {
        val token = binding.inputEnrollToken.text.toString().trim()
        if (token.isEmpty()) {
            toast("Enter the enrollment token")
            return
        }
        enrollWithToken(token)
    }

    private fun enrollWithToken(token: String) {
        binding.btnEnroll.isEnabled = false
        agent.enroll(token) { result ->
            binding.btnEnroll.isEnabled = true
            result
                .onSuccess { toast(it); refreshStatus() }
                .onFailure { toast("Enroll failed: ${it.message}") }
        }
    }

    private fun checkinSilently() {
        agent.checkinNow(currentlyLocked = controller.isLocked()) { result ->
            result.onSuccess { if (it.executed.isNotEmpty()) toast(it.message) }
            refreshStatus()
        }
    }

    private fun refreshStatus() {
        binding.txtStatus.text = controller.statusSummary()
        binding.txtLockStatus.text = controller.statusSummary()
        val owner = controller.isDeviceOwner()
        val enrolled = agent.isEnrolled()

        binding.txtHint.text = if (owner) {
            getString(R.string.hint_ready)
        } else {
            getString(R.string.hint_not_owner)
        }

        // Managed notice when enrolled; staff actions (once PIN-unlocked) switch
        // between enroll (pre-enrollment) and release (enrolled).
        binding.txtAgent.visibility = if (enrolled) View.VISIBLE else View.GONE
        if (enrolled) {
            binding.txtAgent.text = getString(R.string.managed_notice, agent.deviceId())
        }
        binding.enrollGroup.visibility = if (enrolled) View.GONE else View.VISIBLE
        binding.btnRelease.visibility = if (enrolled) View.VISIBLE else View.GONE
        binding.btnDebugRelease.visibility = if (BuildConfig.DEBUG && owner) View.VISIBLE else View.GONE

        if (enrolled) {
            loadCustomerSummary()
        } else {
            renderNoSummary(getString(R.string.summary_not_enrolled))
        }
    }

    private fun showPage(itemId: Int) {
        binding.pageHome.visibility = if (itemId == R.id.nav_home) View.VISIBLE else View.GONE
        binding.pagePayments.visibility = if (itemId == R.id.nav_payments) View.VISIBLE else View.GONE
        binding.pageProfile.visibility = if (itemId == R.id.nav_profile) View.VISIBLE else View.GONE
        binding.pageSupport.visibility = if (itemId == R.id.nav_support) View.VISIBLE else View.GONE
    }

    private fun loadCustomerSummary() {
        binding.txtSummaryState.text = getString(R.string.summary_loading)
        agent.fetchCustomerSummary { result ->
            result
                .onSuccess { renderSummary(it) }
                .onFailure { renderNoSummary(it.message ?: getString(R.string.summary_failed)) }
        }
    }

    private fun renderSummary(outcome: AgentManager.SummaryOutcome) {
        val summary = outcome.summary
        latestSummary = summary
        val loan = summary.loan
        val customerName = summary.customer?.fullName?.takeIf { it.isNotBlank() } ?: "Customer"
        binding.txtGreeting.text = greeting()
        binding.txtAppBarName.text = customerName
        binding.txtAvatar.text = customerName.first().uppercaseChar().toString()
        binding.txtWelcome.text = "Hello, $customerName"
        binding.txtSummaryState.text = if (outcome.cached) {
            "Offline. Showing last update: ${formatDate(outcome.updatedAt)}"
        } else {
            "Updated: ${formatDate(outcome.updatedAt)}"
        }

        if (loan == null) {
            binding.txtRemaining.text = "No active loan found"
            binding.txtPaid.text = "This device is enrolled, but no installment plan is attached."
            binding.progressPaid.progress = 0
            binding.txtNextPayment.text = "Next payment: not available"
            binding.btnPayNow.isEnabled = false
        } else {
            binding.txtRemaining.text = "Remaining: ${formatMoney(loan.remainingAmount, loan.currency)}"
            binding.txtPaid.text = "Paid: ${formatMoney(loan.paidAmount, loan.currency)} of ${formatMoney(loan.totalRepayable, loan.currency)}"
            binding.progressPaid.progress = if (loan.totalRepayable <= 0.0) {
                0
            } else {
                ((loan.paidAmount / loan.totalRepayable) * 100).toInt().coerceIn(0, 100)
            }
            binding.txtNextPayment.text = summary.nextPayment?.let {
                "Next payment: ${formatMoney(it.amount - it.amountPaid, loan.currency)} due ${formatApiDate(it.dueDate)} (${it.status})"
            } ?: "All installments are paid."
            binding.btnPayNow.isEnabled = loan.remainingAmount > 0.0
        }

        binding.txtInstallments.text = buildString {
            appendLine("Installments")
            if (summary.installments.isEmpty()) append("No installments found")
            summary.installments.forEach {
                appendLine(
                    "#${it.sequence}  ${formatApiDate(it.dueDate)}  ${formatMoney(it.amount, loan?.currency ?: "")}  ${it.status}",
                )
            }
        }
        binding.txtRecentPayments.text = buildString {
            appendLine("Recent payments")
            if (summary.recentPayments.isEmpty()) append("No payments yet")
            summary.recentPayments.forEach {
                appendLine(
                    "${formatApiDate(it.receivedAt)}  ${formatMoney(it.amount, loan?.currency ?: "")}  ${it.method}  ${it.status}",
                )
            }
        }
        binding.txtProfile.text = buildString {
            appendLine("Profile")
            appendLine("Name: ${summary.customer?.fullName ?: "Not available"}")
            appendLine("Phone: ${summary.customer?.phone ?: "Not available"}")
            summary.customer?.nationalId?.let { appendLine("National ID: $it") }
            summary.customer?.address?.let { appendLine("Address: $it") }
            appendLine()
            appendLine("Device")
            appendLine("Model: ${listOfNotNull(summary.device.make, summary.device.model).joinToString(" ").ifBlank { "Not available" }}")
            appendLine("IMEI/ID: ${summary.device.imei}")
            summary.device.serialNumber?.let { appendLine("Serial: $it") }
            appendLine("Status: ${summary.device.status}")
        }
    }

    private fun renderNoSummary(message: String) {
        latestSummary = null
        binding.txtSummaryState.text = message
        binding.txtGreeting.text = greeting()
        binding.txtAppBarName.text = "Customer"
        binding.txtAvatar.text = "C"
        binding.txtWelcome.text = "Hello"
        binding.txtRemaining.text = "Account details unavailable"
        binding.txtPaid.text = "Enroll this device to show installment information."
        binding.progressPaid.progress = 0
        binding.txtNextPayment.text = "Next payment: not available"
        binding.btnPayNow.isEnabled = false
        binding.txtInstallments.text = "Installments\nNot available"
        binding.txtRecentPayments.text = "Recent payments\nNot available"
        binding.txtProfile.text = "Profile\nNot available"
    }

    private fun formatMoney(amount: Double, currency: String): String =
        listOf(currency, money.format(amount)).filter { it.isNotBlank() }.joinToString(" ")

    private fun payNowFromSummary() {
        val summary = latestSummary ?: return toast(getString(R.string.summary_failed))
        val loan = summary.loan ?: return toast("No active loan")
        val amount = summary.nextPayment?.let { (it.amount - it.amountPaid).coerceAtLeast(0.0) }
            ?: loan.remainingAmount
        if (amount <= 0.0) return toast("Nothing to pay")
        toast(getString(R.string.pay_now_starting))
        agent.payNow(amount, summary.customer?.phone) { result ->
            result
                .onSuccess {
                    toast(getString(R.string.pay_now_started))
                    AgentSync.requestImmediateSync(applicationContext)
                    loadCustomerSummary()
                }
                .onFailure { toast("${getString(R.string.pay_now_failed)}: ${it.message}") }
        }
    }

    private fun formatDate(ms: Long): String =
        if (ms <= 0L) "unknown" else SimpleDateFormat("dd MMM yyyy HH:mm", Locale.US).format(Date(ms))

    private fun greeting(): String {
        val hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
        return when (hour) {
            in 5..11 -> "Good morning"
            in 12..16 -> "Good afternoon"
            else -> "Good evening"
        }
    }

    private fun formatApiDate(value: String): String = runCatching {
        dateFormat.format(SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).parse(value)!!)
    }.getOrDefault(value.take(10))

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

    companion object {
        private const val POLL_INTERVAL_MS = 10_000L
    }
}

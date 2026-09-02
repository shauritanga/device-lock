package com.devicelock.agent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.devicelock.agent.databinding.ActivityLockBinding

/**
 * Full-screen lock shown to the customer when an installment is overdue.
 *
 * It runs in **lock-task (kiosk) mode**, so the customer cannot swipe it away,
 * open recents, or reach settings. We deliberately keep an "emergency call"
 * affordance and a clear payment instruction visible — locking should never
 * trap a customer with no way to call for help or to pay.
 *
 * The "Simulate payment" button stands in for the real flow, where the backend
 * receives a mobile-money confirmation and pushes an UNLOCK command.
 */
class LockScreenActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLockBinding
    private lateinit var controller: DeviceLockController
    private lateinit var agent: AgentManager

    private val poll = Handler(Looper.getMainLooper())
    private val pollRunnable = object : Runnable {
        override fun run() {
            if (agent.isEnrolled()) checkForRemoteUnlock()
            poll.postDelayed(this, POLL_INTERVAL_MS)
        }
    }

    // Dismiss the lock screen as soon as *anything* unlocks the device — the
    // foreground poll here, or a background [CheckinWorker] running the UNLOCK.
    private val unlockReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            dismiss()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLockBinding.inflate(layoutInflater)
        setContentView(binding.root)
        controller = DeviceLockController(this)
        agent = AgentManager(this)
        registerUnlockReceiver()

        // Unlock (or a HOME relaunch after unlock) must leave kiosk even if
        // this activity was paused — Aquos lock-task often calls onPause.
        if (intent.getBooleanExtra(DeviceLockController.EXTRA_DISMISS, false) ||
            !controller.isLocked()
        ) {
            dismiss()
            return
        }

        // Enter kiosk mode so this screen owns the device.
        runCatching { startLockTask() }
        // Start polling here, not only in onResume — lock-task on Aquos can
        // pause the activity and would otherwise never pull UNLOCK.
        poll.postDelayed(pollRunnable, POLL_INTERVAL_MS)

        // Show the helpline as text as well as a button: if the dialer is
        // unavailable for any reason, the customer can still read the number and
        // call from another phone.
        binding.txtSupportNumber.text =
            getString(R.string.lock_support_number, BuildConfig.SUPPORT_PHONE)

        // Emergency services. Deliberately NOT the company helpline — someone in
        // real trouble must reach 112, not our call centre.
        binding.btnEmergency.setOnClickListener { dial(EMERGENCY_NUMBER) }

        // Company helpline for payment and account questions.
        binding.btnSupport.setOnClickListener { dial(BuildConfig.SUPPORT_PHONE) }

        binding.btnPayNow.setOnClickListener {
            Toast.makeText(this, R.string.pay_now_starting, Toast.LENGTH_SHORT).show()
            agent.payNow(amount = null, phoneNumber = null) { result ->
                result
                    .onSuccess {
                        Toast.makeText(this, R.string.pay_now_started, Toast.LENGTH_LONG).show()
                        AgentSync.requestImmediateSync(applicationContext)
                    }
                    .onFailure {
                        Toast.makeText(
                            this,
                            "${getString(R.string.pay_now_failed)}: ${it.message}",
                            Toast.LENGTH_LONG,
                        ).show()
                    }
            }
        }

        // "I've paid" only asks the backend to re-check; it can NEVER unlock the
        // device locally. The device unlocks only when the backend confirms
        // payment and sends an UNLOCK command (delivered via FCM / check-in).
        binding.btnCheckPayment.setOnClickListener {
            AgentSync.requestImmediateSync(applicationContext)
            Toast.makeText(this, R.string.lock_check_payment_toast, Toast.LENGTH_SHORT)
                .show()
        }
    }

    /**
     * Open the dialer with [number] pre-filled. We use ACTION_DIAL rather than
     * ACTION_CALL so no call is placed without the customer confirming, and so
     * the app needs no CALL_PHONE permission. The dialer package is whitelisted
     * for lock-task in [DeviceLockController.lock], which is what lets this work
     * while the kiosk is active.
     */
    private fun dial(number: String) {
        val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$number"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { startActivity(intent) }.onFailure {
            Toast.makeText(
                this,
                getString(R.string.lock_call_failed, number),
                Toast.LENGTH_LONG,
            ).show()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.getBooleanExtra(DeviceLockController.EXTRA_DISMISS, false) ||
            !controller.isLocked()
        ) {
            dismiss()
        }
    }

    override fun onResume() {
        super.onResume()
        if (!controller.isLocked()) {
            dismiss()
            return
        }
        poll.removeCallbacks(pollRunnable)
        poll.postDelayed(pollRunnable, POLL_INTERVAL_MS)
    }

    override fun onDestroy() {
        poll.removeCallbacks(pollRunnable)
        runCatching { unregisterReceiver(unlockReceiver) }
        super.onDestroy()
    }

    private fun registerUnlockReceiver() {
        val filter = IntentFilter(DeviceLockController.ACTION_UNLOCKED)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(unlockReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(unlockReceiver, filter)
        }
    }

    /**
     * While locked, keep checking in so a remote UNLOCK (e.g. staff clears the
     * arrears from the dashboard) releases the device without customer action.
     * The check-in runs [DeviceLockController.unlock] (which clears the lock
     * state); we then dismiss ourselves.
     */
    private fun checkForRemoteUnlock() {
        agent.checkinNow(currentlyLocked = true) {
            if (!controller.isLocked()) dismiss()
        }
    }

    /**
     * Leave the lock screen and hand control back to the real launcher. Because
     * the lock screen can be the HOME activity, a bare finish() would race the
     * system re-resolving HOME; instead we leave kiosk mode and explicitly launch
     * HOME (the lock alias is already disabled by unlock, so this is the launcher)
     * before finishing.
     */
    private fun dismiss() {
        poll.removeCallbacks(pollRunnable)
        runCatching { stopLockTask() }
        runCatching { controller.clearLockTaskSession() }
        runCatching {
            startActivity(
                Intent(Intent.ACTION_MAIN)
                    .addCategory(Intent.CATEGORY_HOME)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }
        finish()
    }

    // Block the back button while locked.
    @Deprecated("Intentionally swallow back while locked")
    override fun onBackPressed() {
        // no-op
    }

    companion object {
        private const val POLL_INTERVAL_MS = 5_000L

        /** Tanzania / GSM standard emergency number. */
        private const val EMERGENCY_NUMBER = "112"
    }
}

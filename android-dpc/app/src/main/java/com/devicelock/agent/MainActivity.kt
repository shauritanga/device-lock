package com.devicelock.agent

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.devicelock.agent.databinding.ActivityMainBinding

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

        controller = DeviceLockController(this)
        agent = AgentManager(this)

        binding.btnRefresh.setOnClickListener { refreshStatus() }
        binding.btnStaffUnlock.setOnClickListener { unlockStaff() }
        binding.btnEnroll.setOnClickListener { enroll() }
        binding.btnRelease.setOnClickListener { requestRelease() }

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

    private fun enroll() {
        val token = binding.inputEnrollToken.text.toString().trim()
        if (token.isEmpty()) {
            toast("Enter the enrollment token")
            return
        }
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
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

    companion object {
        private const val POLL_INTERVAL_MS = 10_000L
    }
}

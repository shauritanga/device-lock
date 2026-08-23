package com.devicelock.agent

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.PersistableBundle
import android.widget.Toast

/**
 * Device Admin / Device Owner receiver.
 *
 * This component is what Android binds to when the app is made a Device Owner
 * (via `adb shell dpm set-device-owner ...` for the POC, or via QR / zero-touch
 * provisioning in production). Once we are Device Owner, [DeviceLockController]
 * can enforce kiosk lock, block factory reset, etc.
 */
class LockAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: android.content.Intent) {
        Toast.makeText(context, "Device Lock admin enabled", Toast.LENGTH_SHORT).show()
        // Lock down anti-removal (no factory reset / safe boot / add user) the
        // instant we become Device Owner, so the device is protected from wipe
        // from the very start — not only once a loan goes overdue.
        runCatching { DeviceLockController(context).applyManagedRestrictions() }
    }

    override fun onDisabled(context: Context, intent: Intent) {
        Toast.makeText(context, "Device Lock admin disabled", Toast.LENGTH_SHORT).show()
    }

    /**
     * Fired when zero-touch / QR provisioning finishes making us Device Owner.
     * The setup wizard passes the admin-extras bundle from the QR here; we pull
     * the enrollment token out of it, stash it, and kick off [EnrollWorker] so
     * the device enrols itself with no staff interaction. Anti-removal is applied
     * immediately so the fresh device is protected from the first moment.
     */
    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        runCatching { DeviceLockController(context).applyManagedRestrictions() }

        val extras: PersistableBundle? =
            intent.getParcelableExtra(
                DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE,
            )
        val token = extras?.getString(EXTRA_ENROLLMENT_TOKEN)?.takeIf { it.isNotBlank() }
        if (token != null) {
            AgentStore(context).pendingEnrollToken = token
            AgentSync.requestEnroll(context)
        }
    }

    companion object {
        /** Key inside PROVISIONING_ADMIN_EXTRAS_BUNDLE carrying the enroll token. */
        const val EXTRA_ENROLLMENT_TOKEN = "enrollmentToken"

        fun componentName(context: Context): ComponentName =
            ComponentName(context.applicationContext, LockAdminReceiver::class.java)
    }
}

package com.devicelock.agent

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.PersistableBundle


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
        // Do not apply user restrictions here. The setup wizard is still
        // running; DISALLOW_FACTORY_RESET during this callback aborts setup
        // on some Pixels with "Something went wrong".
    }

    override fun onDisabled(context: Context, intent: Intent) {
    }

    /**
     * Fired when zero-touch / QR provisioning finishes making us Device Owner.
     * The setup wizard passes the admin-extras bundle from the QR here; we pull
     * the enrollment token out of it, stash it, and kick off [EnrollWorker] so
     * the device enrols itself with no staff interaction. Anti-removal is applied
     * immediately so the fresh device is protected from the first moment.
     */
    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        val extras: PersistableBundle? =
            runCatching {
                intent.getParcelableExtra<PersistableBundle>(
                    DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE,
                )
            }.getOrNull()
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

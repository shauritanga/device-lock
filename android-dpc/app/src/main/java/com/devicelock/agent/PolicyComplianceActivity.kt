package com.devicelock.agent

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.os.Build
import android.os.Bundle
import android.os.PersistableBundle

/**
 * Required from Android 10+. Called after we become Device Owner so we can
 * apply policy and finish setup. Missing this screen also produces
 * "Something went wrong" after the APK installs.
 */
class PolicyComplianceActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        runCatching { DeviceLockController(this).applyManagedRestrictions() }

        val extras = extrasBundle()
        val token = extras?.getString(LockAdminReceiver.EXTRA_ENROLLMENT_TOKEN)
            ?.takeIf { it.isNotBlank() }
        if (token != null) {
            AgentStore(this).pendingEnrollToken = token
            AgentSync.requestEnroll(this)
        }

        setResult(RESULT_OK)
        finish()
    }

    private fun extrasBundle(): PersistableBundle? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(
                DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE,
                PersistableBundle::class.java,
            )
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(
                DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE,
            )
        }
}

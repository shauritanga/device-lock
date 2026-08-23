package com.devicelock.agent

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.os.Build
import android.os.Bundle
import android.os.PersistableBundle

/** Required from Android 10+. Must return RESULT_OK without crashing. */
class PolicyComplianceActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        runCatching {
            val extras = extrasBundle()
            val token = extras?.getString(LockAdminReceiver.EXTRA_ENROLLMENT_TOKEN)
                ?.takeIf { it.isNotBlank() }
            if (token != null) {
                AgentStore(this).pendingEnrollToken = token
                AgentSync.requestEnroll(this)
            }
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

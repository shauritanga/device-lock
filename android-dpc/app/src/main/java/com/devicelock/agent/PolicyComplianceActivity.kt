package com.devicelock.agent

import android.app.admin.DevicePolicyManager
import android.os.Build
import android.os.Bundle
import android.os.PersistableBundle
import androidx.appcompat.app.AppCompatActivity

/**
 * Required from Android 10+. Called after we become Device Owner. Must return
 * RESULT_OK or the wizard reports that setup failed.
 */
class PolicyComplianceActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_provisioning)

        val extras = extrasBundle()
        val token = extras?.getString(LockAdminReceiver.EXTRA_ENROLLMENT_TOKEN)
            ?.takeIf { it.isNotBlank() }
        if (token != null) {
            AgentStore(this).pendingEnrollToken = token
            AgentSync.requestEnroll(this)
        }

        window.decorView.post {
            setResult(RESULT_OK)
            finish()
        }
    }

    private fun extrasBundle(): PersistableBundle? = runCatching {
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
    }.getOrNull()
}

package com.devicelock.agent

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.PersistableBundle

/**
 * Required from Android 10+. After the setup wizard installs this APK it asks
 * which management mode we want. Without this activity, provisioning ends with
 * a generic "Something went wrong" right after the download/install step.
 */
class GetProvisioningModeActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val fullyManaged = DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val allowed = intent.getIntegerArrayListExtra(
                DevicePolicyManager.EXTRA_PROVISIONING_ALLOWED_PROVISIONING_MODES,
            )
            if (allowed != null && !allowed.contains(fullyManaged)) {
                setResult(RESULT_CANCELED)
                finish()
                return
            }
        }

        val adminExtras =
            extrasBundle() ?: PersistableBundle()

        setResult(
            RESULT_OK,
            Intent().apply {
                putExtra(DevicePolicyManager.EXTRA_PROVISIONING_MODE, fullyManaged)
                putExtra(
                    DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE,
                    adminExtras,
                )
            },
        )
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

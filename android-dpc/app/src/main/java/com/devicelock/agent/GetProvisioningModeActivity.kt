package com.devicelock.agent

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.os.Build
import android.os.Bundle

/**
 * Required from Android 10+. Keep this activity tiny: no AppCompat, no layout.
 * Inflating Material during Setup Wizard crashes on Pixel and shows
 * "Something went wrong / contact your IT admin".
 */
class GetProvisioningModeActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val fullyManaged = DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE
        var mode = fullyManaged
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val allowed = intent.getIntegerArrayListExtra(
                DevicePolicyManager.EXTRA_PROVISIONING_ALLOWED_PROVISIONING_MODES,
            )
            if (!allowed.isNullOrEmpty() && !allowed.contains(fullyManaged)) {
                mode = allowed[0]
            }
        }

        setResult(
            RESULT_OK,
            Intent().putExtra(DevicePolicyManager.EXTRA_PROVISIONING_MODE, mode),
        )
        finish()
    }
}

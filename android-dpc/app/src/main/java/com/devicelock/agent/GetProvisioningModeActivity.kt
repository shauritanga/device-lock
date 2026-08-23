package com.devicelock.agent

import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity

/**
 * Required from Android 10+. After the setup wizard installs this APK it asks
 * which management mode we want. Returning CANCELED or crashing here shows a
 * generic "Something went wrong" on the phone.
 */
class GetProvisioningModeActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_provisioning)

        val fullyManaged = DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE
        var mode = fullyManaged
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val allowed = intent.getIntegerArrayListExtra(
                DevicePolicyManager.EXTRA_PROVISIONING_ALLOWED_PROVISIONING_MODES,
            )
            // Empty list must NOT cancel — Pixel/AOSP treat it as "any mode".
            if (!allowed.isNullOrEmpty() && !allowed.contains(fullyManaged)) {
                mode = allowed[0]
            }
        }

        val result = Intent().putExtra(
            DevicePolicyManager.EXTRA_PROVISIONING_MODE,
            mode,
        )
        // Let the window draw first. Theme.NoDisplay + finish-in-onCreate
        // crashes setup on newer Pixels.
        window.decorView.post {
            setResult(RESULT_OK, result)
            finish()
        }
    }
}

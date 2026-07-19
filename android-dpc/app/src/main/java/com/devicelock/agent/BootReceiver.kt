package com.devicelock.agent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Restores the agent after a reboot.
 *
 * The device-owner user restrictions (no factory reset, no debugging, …) survive
 * a reboot on their own, but two things do not and must be re-established here:
 *  1. the full-screen kiosk lock — the device boots to the launcher, so if the
 *     customer was locked we must bring the lock screen back, otherwise a reboot
 *     is a trivial way to escape it; and
 *  2. the background check-in loop, plus an immediate sync to pick up any command
 *     that was queued while the device was powered off.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON" -> Unit
            else -> return
        }

        val appContext = context.applicationContext

        // Resume delivery and catch up on anything missed while off.
        AgentSync.schedulePeriodic(appContext)
        AgentSync.requestImmediateSync(appContext)
        AgentManager(appContext).enforceOfflinePolicy()

        // Re-assert anti-removal (device-owner restrictions persist across reboot,
        // but re-applying is cheap insurance) and the lock if we were locked.
        val controller = DeviceLockController(appContext)
        if (controller.isDeviceOwner()) {
            runCatching { controller.applyManagedRestrictions() }
            if (controller.isLocked()) {
                runCatching { controller.lock() }
            }
        }
    }
}

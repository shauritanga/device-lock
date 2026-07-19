package com.devicelock.agent

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.UserManager

/**
 * Thin wrapper around [DevicePolicyManager] that expresses the locking policy
 * a phone-financing agent needs. Every method here requires the app to be the
 * **Device Owner** — see [isDeviceOwner].
 *
 * In production these actions are triggered by commands pushed from the backend
 * (e.g. "installment overdue -> LOCK"). For the POC we trigger them from the UI.
 */
class DeviceLockController(private val context: Context) {

    private val dpm: DevicePolicyManager =
        context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

    private val admin = LockAdminReceiver.componentName(context)

    /** True only when this app owns the device and can enforce policy. */
    fun isDeviceOwner(): Boolean = dpm.isDeviceOwnerApp(context.packageName)

    /**
     * Anti-removal policy that applies for the whole life of the loan — set at
     * enrollment and kept on regardless of lock state, so the customer can't
     * factory-reset, safe-boot, or add a user to wipe/escape the agent. Only
     * [releaseDevice] lifts these (loan fully paid). Idempotent.
     */
    fun applyManagedRestrictions() {
        if (!isDeviceOwner()) return
        for (restriction in MANAGED_RESTRICTIONS) {
            dpm.addUserRestriction(admin, restriction)
        }
        grantAgentPermissions()
    }

    fun managedRestrictionsApplied(): Boolean {
        if (!isDeviceOwner()) return false
        val restrictions = dpm.getUserRestrictions(admin)
        return MANAGED_RESTRICTIONS.all { restrictions.getBoolean(it, false) }
    }

    private fun grantAgentPermissions() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        for (permission in AGENT_PERMISSIONS) {
            dpm.setPermissionGrantState(
                admin,
                context.packageName,
                permission,
                DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED,
            )
        }
    }

    /**
     * Put the device into the "overdue / locked" state:
     *  - Allow our app to run as a kiosk (lock task) and lock it down hard
     *  - Disable debugging while locked
     *  - Show the full-screen payment-reminder lock screen
     *
     * Anti-removal restrictions are already in force from enrollment
     * ([applyManagedRestrictions]); we re-assert them here as belt-and-suspenders.
     */
    fun lock() {
        require(isDeviceOwner()) { "Not device owner" }

        // Permit our package to enter lock-task (kiosk) mode.
        dpm.setLockTaskPackages(admin, arrayOf(context.packageName))

        // Lock the kiosk down hard: no status bar, home, recents, notifications,
        // system info, or long-press power menu. LOCK_TASK_FEATURE_NONE (0) turns
        // every escape affordance off — the customer is left with only our screen.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            dpm.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_NONE)
        }

        // Anti-removal restrictions persist across lock/unlock; ensure they're on.
        applyManagedRestrictions()
        // Disable adb/debugging only while locked.
        dpm.addUserRestriction(admin, UserManager.DISALLOW_DEBUGGING_FEATURES)

        // Make the lock screen the device HOME, so a reboot lands straight on it
        // with no usable window before it appears.
        setLockScreenAsHome(true)

        markLocked(true)

        // Bring up the lock screen on top of everything.
        val intent = Intent(context, LockScreenActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        }
        context.startActivity(intent)
    }

    /**
     * Route (or stop routing) HOME to our lock screen. While enabled, the
     * launcher is effectively replaced by the lock screen — including at boot.
     *
     * The HOME entry-point is a normally-disabled activity-alias, so when we're
     * not locked it isn't a home candidate at all (no launcher chooser). We
     * enable it and mark it the persistent preferred HOME while locked, and
     * reverse both on unlock.
     */
    private fun setLockScreenAsHome(enabled: Boolean) {
        val alias = ComponentName(context, LOCK_HOME_ALIAS)
        val pm = context.packageManager
        if (enabled) {
            pm.setComponentEnabledSetting(
                alias,
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                PackageManager.DONT_KILL_APP,
            )
            val filter = IntentFilter(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                addCategory(Intent.CATEGORY_DEFAULT)
            }
            dpm.addPersistentPreferredActivity(admin, filter, alias)
        } else {
            dpm.clearPackagePersistentPreferredActivities(admin, context.packageName)
            pm.setComponentEnabledSetting(
                alias,
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP,
            )
        }
    }

    /**
     * Return the device to normal use (e.g. after a payment clears). Lifts only
     * the lock-specific restrictions — the anti-removal policy stays in force
     * because the loan is still outstanding.
     */
    fun unlock() {
        require(isDeviceOwner()) { "Not device owner" }

        dpm.clearUserRestriction(admin, UserManager.DISALLOW_DEBUGGING_FEATURES)
        dpm.setLockTaskPackages(admin, arrayOf())
        // Hand HOME back to the normal launcher.
        setLockScreenAsHome(false)

        markLocked(false)

        // Tell any visible lock screen to dismiss, whatever triggered the unlock
        // (staff button, foreground poll, or a background check-in Worker).
        context.sendBroadcast(
            Intent(ACTION_UNLOCKED).setPackage(context.packageName),
        )
    }

    /**
     * Loan fully paid: hand the device back to the customer. Lifts every
     * restriction and relinquishes Device Owner, after which the app is an
     * ordinary (uninstallable) app and the device is fully the customer's.
     *
     * Production should gate this on backend confirmation that the loan is
     * COMPLETED; here it is a staff-PIN-gated action.
     */
    fun releaseDevice() {
        if (!isDeviceOwner()) return

        dpm.clearUserRestriction(admin, UserManager.DISALLOW_DEBUGGING_FEATURES)
        for (restriction in MANAGED_RESTRICTIONS) {
            dpm.clearUserRestriction(admin, restriction)
        }
        dpm.setLockTaskPackages(admin, arrayOf())
        setLockScreenAsHome(false)
        markLocked(false)

        @Suppress("DEPRECATION")
        dpm.clearDeviceOwnerApp(context.packageName)
    }

    /** Persist desired lock state so the lock screen can re-assert itself on reboot. */
    private fun markLocked(locked: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putBoolean(KEY_LOCKED, locked).apply()
    }

    fun isLocked(): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_LOCKED, false)

    /**
     * Best-effort summary of the current device state for the staff screen.
     */
    fun statusSummary(): String = buildString {
        appendLine("Device owner: ${isDeviceOwner()}")
        appendLine("Managed restrictions: ${managedRestrictionsApplied()}")
        appendLine("Locked (policy): ${isLocked()}")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            appendLine("API level: ${Build.VERSION.SDK_INT}")
        }
    }

    companion object {
        private const val PREFS = "device_lock_prefs"
        private const val KEY_LOCKED = "locked"

        /** Broadcast (package-internal) sent whenever the device is unlocked. */
        const val ACTION_UNLOCKED = "com.devicelock.agent.action.UNLOCKED"

        /** Normally-disabled HOME alias enabled only while locked. */
        private const val LOCK_HOME_ALIAS = "com.devicelock.agent.LockHomeAlias"

        /** Anti-removal restrictions kept on for the whole life of the loan. */
        private val MANAGED_RESTRICTIONS = arrayOf(
            UserManager.DISALLOW_FACTORY_RESET,
            UserManager.DISALLOW_SAFE_BOOT,
            UserManager.DISALLOW_ADD_USER,
        )

        private val AGENT_PERMISSIONS = arrayOf(
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.READ_PHONE_NUMBERS,
        )
    }
}

package com.devicelock.agent

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock

/**
 * While the kiosk is up, FCM may be missing and WorkManager's 15-minute floor
 * is too slow for a shop unlock. This alarm re-checks every 30s.
 */
class LockCheckinReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        if (!DeviceLockController(app).isLocked()) {
            cancel(app)
            return
        }
        AgentSync.requestImmediateSync(app)
        schedule(app)
    }

    companion object {
        private const val INTERVAL_MS = 30_000L
        private const val REQUEST_CODE = 71

        fun schedule(context: Context) {
            val app = context.applicationContext
            val am = app.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val trigger = SystemClock.elapsedRealtime() + INTERVAL_MS
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setAndAllowWhileIdle(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    trigger,
                    pending(app),
                )
            } else {
                @Suppress("DEPRECATION")
                am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, pending(app))
            }
        }

        fun cancel(context: Context) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            am.cancel(pending(context.applicationContext))
        }

        private fun pending(context: Context): PendingIntent {
            val intent = Intent(context, LockCheckinReceiver::class.java)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            return PendingIntent.getBroadcast(context, REQUEST_CODE, intent, flags)
        }
    }
}

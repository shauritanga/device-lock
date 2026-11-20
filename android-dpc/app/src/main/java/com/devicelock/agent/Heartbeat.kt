package com.devicelock.agent

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.SystemClock

/**
 * A self-rearming alarm that does not depend on WorkManager or FCM.
 *
 * Phone makers' battery managers can stop WorkManager jobs and push delivery for
 * days. A pending alarm survives process death, and `setAndAllowWhileIdle` still
 * fires in Doze. Every time it fires it kicks a check-in and the offline policy,
 * then arms the next one. It is re-armed on boot, on app update and whenever the
 * app process starts (see [AgentApplication]).
 */
object Heartbeat {
    private const val INTERVAL_MS = 15L * 60 * 1000
    private const val REQUEST_CODE = 72

    fun schedule(context: Context) {
        val app = context.applicationContext
        val am = app.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.setAndAllowWhileIdle(
            AlarmManager.ELAPSED_REALTIME_WAKEUP,
            SystemClock.elapsedRealtime() + INTERVAL_MS,
            pending(app),
        )
    }

    fun cancel(context: Context) {
        val app = context.applicationContext
        (app.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pending(app))
    }

    private fun pending(context: Context): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            REQUEST_CODE,
            Intent(context, HeartbeatReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
}

class HeartbeatReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        if (AgentStore(app).released) return // phone belongs to the customer: stop for good
        Heartbeat.schedule(app) // arm the next one first, so a crash below cannot end the chain
        AgentSync.requestImmediateSync(app)
        AgentSync.requestOfflinePolicyCheck(app)
    }
}

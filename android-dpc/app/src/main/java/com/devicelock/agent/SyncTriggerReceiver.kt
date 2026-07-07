package com.devicelock.agent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Fires an expedited background check-in on demand. Used by:
 *  - the FCM push path (a "check in now" data message), and
 *  - manual testing:  adb shell am broadcast -a com.devicelock.agent.SYNC_NOW \
 *                       -n com.devicelock.agent/.SyncTriggerReceiver
 *
 * It enqueues a Worker rather than doing network work inline, so delivery still
 * completes even if the process is torn down right after the broadcast.
 */
class SyncTriggerReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        AgentSync.requestImmediateSync(context.applicationContext)
    }
}

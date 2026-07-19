package com.devicelock.agent

import android.content.Context
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Instant delivery path. When the backend queues a command it also sends a
 * silent FCM data message; here we react by kicking off an expedited background
 * check-in, so the device locks/unlocks within seconds instead of waiting for
 * the periodic [CheckinWorker].
 *
 * FCM is a latency optimisation only — if push is unavailable (no Firebase
 * config, no network at send time) the periodic check-in still delivers the
 * command. Requires a Firebase project: drop `google-services.json` into
 * `app/` and the google-services plugin (see build.gradle) lights this up.
 */
class AgentMessagingService : FirebaseMessagingService() {

    /** New/rotated token: persist it and push it to the backend on next sync. */
    override fun onNewToken(token: String) {
        val store = AgentStore(applicationContext)
        store.fcmToken = token
        if (store.isEnrolled) {
            // Report the fresh token promptly via a check-in.
            AgentSync.requestImmediateSync(applicationContext)
        }
    }

    /** "Check in now" wake-up: run a background check-in to pull commands. */
    override fun onMessageReceived(message: RemoteMessage) {
        AgentSync.requestImmediateSync(applicationContext)
    }

    companion object {
        fun refreshToken(context: Context) {
            FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
                val store = AgentStore(context.applicationContext)
                store.fcmToken = token
                if (store.isEnrolled) {
                    AgentSync.requestImmediateSync(context.applicationContext)
                }
            }
        }
    }
}

package com.devicelock.agent

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

/**
 * Runs one backend check-in off the main thread, executing any pending LOCK /
 * UNLOCK commands. This is the *reliable* delivery path: it runs even when no
 * screen is open, so an idle or sleeping device still receives commands.
 *
 * Scheduled two ways (see [AgentSync]):
 *  - periodically (~15 min minimum) as the guaranteed fallback, and
 *  - as an expedited one-shot when an FCM push says "check in now".
 */
class CheckinWorker(context: Context, params: WorkerParameters) :
    Worker(context, params) {

    override fun doWork(): Result {
        val agent = AgentManager(applicationContext)
        if (!agent.isEnrolled()) return Result.success() // nothing to do yet

        return try {
            agent.performCheckin(currentlyLocked = agent.isLocked())
            Result.success()
        } catch (t: Throwable) {
            agent.enforceOfflinePolicy()
            // Transient (e.g. offline): let WorkManager retry with backoff.
            Result.retry()
        }
    }
}

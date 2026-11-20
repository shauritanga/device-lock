package com.devicelock.agent

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

/**
 * Enforces the lock policy from cached data, with NO network constraint.
 * [CheckinWorker] only runs when the phone is online, so without this a phone
 * with no data would never lock itself when an installment is overdue.
 */
class OfflinePolicyWorker(context: Context, params: WorkerParameters) :
    Worker(context, params) {

    override fun doWork(): Result {
        val agent = AgentManager(applicationContext)
        if (agent.isEnrolled()) runCatching { agent.enforceOfflinePolicy() }
        return Result.success()
    }
}

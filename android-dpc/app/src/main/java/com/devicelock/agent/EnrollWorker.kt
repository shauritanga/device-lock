package com.devicelock.agent

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

/**
 * Completes zero-touch / QR enrollment off the main thread. After the setup
 * wizard makes us Device Owner, [LockAdminReceiver.onProfileProvisioningComplete]
 * stashes the enrollment token and enqueues this worker, which exchanges it for
 * a per-device agent token — so the device enrols with no staff typing.
 *
 * Runs with backoff (see [AgentSync.requestEnroll]) so a device provisioned
 * before it has network still enrols as soon as it comes online.
 */
class EnrollWorker(context: Context, params: WorkerParameters) :
    Worker(context, params) {

    override fun doWork(): Result {
        val store = AgentStore(applicationContext)
        if (store.isEnrolled) {
            store.pendingEnrollToken = null
            return Result.success()
        }
        val token = store.pendingEnrollToken
        if (token.isNullOrBlank()) return Result.success() // nothing pending

        return try {
            AgentManager(applicationContext).performEnroll(token)
            store.pendingEnrollToken = null
            runCatching { DeviceLockController(applicationContext).applyManagedRestrictions() }
            Result.success()
        } catch (t: Throwable) {
            // Transient (offline / backend not reachable yet): retry with backoff.
            Result.retry()
        }
    }
}

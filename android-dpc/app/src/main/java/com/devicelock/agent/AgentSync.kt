package com.devicelock.agent

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * Schedules background check-ins via WorkManager.
 *
 *  - [schedulePeriodic] installs the guaranteed fallback loop (kept even across
 *    reboots / app upgrades) so commands are never missed for long.
 *  - [requestImmediateSync] fires an expedited one-shot, used by the FCM push
 *    receiver and the manual "sync now" trigger for near-instant delivery.
 */
object AgentSync {

    private const val PERIODIC_WORK = "device-lock-checkin-periodic"
    private const val IMMEDIATE_WORK = "device-lock-checkin-now"
    private const val ENROLL_WORK = "device-lock-enroll"

    fun schedulePeriodic(context: Context) {
        val request = PeriodicWorkRequestBuilder<CheckinWorker>(
            15, TimeUnit.MINUTES,
        )
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC_WORK,
            ExistingPeriodicWorkPolicy.UPDATE,
            request,
        )
        requestImmediateSync(context)
    }

    /**
     * Kick off zero-touch enrollment: exchange the token the setup wizard handed
     * us (stored by [LockAdminReceiver]) for an agent token. Retries with backoff
     * until the device has network, so provisioning offline still enrols later.
     */
    fun requestEnroll(context: Context) {
        val request = OneTimeWorkRequestBuilder<EnrollWorker>()
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()

        WorkManager.getInstance(context).enqueueUniqueWork(
            ENROLL_WORK,
            ExistingWorkPolicy.KEEP,
            request,
        )
    }

    fun requestImmediateSync(context: Context) {
        // Not marked expedited: pre-Android-12, expedited work must run as a
        // foreground service (visible notification), which we don't want for a
        // silent lock agent. An FCM high-priority push already wakes the process,
        // so this normal one-shot still runs promptly.
        val request = OneTimeWorkRequestBuilder<CheckinWorker>()
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .build()

        WorkManager.getInstance(context).enqueueUniqueWork(
            IMMEDIATE_WORK,
            ExistingWorkPolicy.REPLACE,
            request,
        )
    }
}

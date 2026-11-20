package com.devicelock.agent

import android.app.Application

/**
 * Runs whenever the app process starts, including when a push or an alarm wakes
 * it. Re-establishes every background mechanism so a phone that lost its jobs
 * (battery manager, update, crash) heals itself the next time it is woken.
 */
class AgentApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        runCatching {
            val store = AgentStore(this)
            if (store.isEnrolled && !store.released) AgentSync.schedulePeriodic(this)
        }
    }
}

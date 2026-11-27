package com.devicelock.agent

import android.app.Application
import kotlin.concurrent.thread

/**
 * Runs whenever the app process starts, including when a push or an alarm wakes
 * it. Re-establishes every background mechanism so a phone that lost its jobs
 * (battery manager, update, crash) heals itself the next time it is woken.
 */
class AgentApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // WorkManager setup can block. The activity must still be able to draw.
        thread(name = "agent-start", start = true) {
            runCatching {
                val store = AgentStore(this@AgentApplication)
                if (store.isEnrolled && !store.released) {
                    AgentSync.schedulePeriodic(this@AgentApplication)
                }
            }
        }
    }
}

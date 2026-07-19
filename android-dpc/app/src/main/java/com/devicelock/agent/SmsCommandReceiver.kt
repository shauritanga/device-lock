package com.devicelock.agent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

/** Receives signed fallback commands sent over SMS when data/push delivery fails. */
class SmsCommandReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val pending = goAsync()
        Thread {
            try {
                val agent = AgentManager(context.applicationContext)
                for (sms in Telephony.Sms.Intents.getMessagesFromIntent(intent)) {
                    val body = sms.displayMessageBody ?: continue
                    if (body.startsWith("DL1|") && runCatching { agent.handleSmsCommand(body) }.getOrDefault(false)) {
                        abortBroadcast()
                    }
                }
            } finally {
                pending.finish()
            }
        }.start()
    }
}

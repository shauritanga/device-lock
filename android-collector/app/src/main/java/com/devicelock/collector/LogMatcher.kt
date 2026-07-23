package com.devicelock.collector

import android.content.Context
import android.database.Cursor
import android.provider.CallLog
import android.provider.Telephony
import java.time.Instant
import java.time.format.DateTimeFormatter

data class LogMatch(
    val channel: String, // CALL or SMS
    val logAtMillis: Long,
    val durationSeconds: Int?,
    val matchedPhone: String,
    val direction: String,
) {
    val logAtIso: String
        get() = DateTimeFormatter.ISO_INSTANT.format(Instant.ofEpochMilli(logAtMillis))
}

/**
 * Scans recent outgoing call/SMS logs for a match to [customerPhone]
 * after [sessionStartedAtMillis] (within [windowMs]).
 */
object LogMatcher {

    fun findCallMatch(
        context: Context,
        customerPhone: String,
        sessionStartedAtMillis: Long,
        windowMs: Long = 30 * 60 * 1000L,
    ): LogMatch? {
        val expected = digits(customerPhone)
        val end = sessionStartedAtMillis + windowMs
        val uri = CallLog.Calls.CONTENT_URI
        val projection = arrayOf(
            CallLog.Calls.NUMBER,
            CallLog.Calls.TYPE,
            CallLog.Calls.DATE,
            CallLog.Calls.DURATION,
        )
        val selection =
            "${CallLog.Calls.TYPE}=? AND ${CallLog.Calls.DATE}>=? AND ${CallLog.Calls.DATE}<=?"
        val args = arrayOf(
            CallLog.Calls.OUTGOING_TYPE.toString(),
            sessionStartedAtMillis.toString(),
            end.toString(),
        )
        context.contentResolver.query(
            uri,
            projection,
            selection,
            args,
            "${CallLog.Calls.DATE} DESC",
        )?.use { cursor ->
            while (cursor.moveToNext()) {
                val number = cursor.str(CallLog.Calls.NUMBER) ?: continue
                if (!phonesMatch(expected, digits(number))) continue
                val date = cursor.long(CallLog.Calls.DATE)
                val duration = cursor.long(CallLog.Calls.DURATION).toInt()
                return LogMatch(
                    channel = "CALL",
                    logAtMillis = date,
                    durationSeconds = duration,
                    matchedPhone = number,
                    direction = "OUTGOING",
                )
            }
        }
        return null
    }

    fun findSmsMatch(
        context: Context,
        customerPhone: String,
        sessionStartedAtMillis: Long,
        windowMs: Long = 30 * 60 * 1000L,
    ): LogMatch? {
        val expected = digits(customerPhone)
        val end = sessionStartedAtMillis + windowMs
        val uri = Telephony.Sms.Sent.CONTENT_URI
        val projection = arrayOf(
            Telephony.Sms.ADDRESS,
            Telephony.Sms.DATE,
            Telephony.Sms.TYPE,
        )
        val selection = "${Telephony.Sms.DATE}>=? AND ${Telephony.Sms.DATE}<=?"
        val args = arrayOf(sessionStartedAtMillis.toString(), end.toString())
        context.contentResolver.query(
            uri,
            projection,
            selection,
            args,
            "${Telephony.Sms.DATE} DESC",
        )?.use { cursor ->
            while (cursor.moveToNext()) {
                val address = cursor.str(Telephony.Sms.ADDRESS) ?: continue
                if (!phonesMatch(expected, digits(address))) continue
                val date = cursor.long(Telephony.Sms.DATE)
                return LogMatch(
                    channel = "SMS",
                    logAtMillis = date,
                    durationSeconds = null,
                    matchedPhone = address,
                    direction = "OUTGOING",
                )
            }
        }
        return null
    }

    private fun digits(phone: String) = phone.filter { it.isDigit() }

    private fun phonesMatch(a: String, b: String): Boolean {
        if (a.isEmpty() || b.isEmpty()) return false
        if (a == b) return true
        val ta = a.takeLast(9)
        val tb = b.takeLast(9)
        return ta.length >= 9 && ta == tb
    }

    private fun Cursor.str(col: String): String? {
        val i = getColumnIndex(col)
        return if (i >= 0 && !isNull(i)) getString(i) else null
    }

    private fun Cursor.long(col: String): Long {
        val i = getColumnIndex(col)
        return if (i >= 0 && !isNull(i)) getLong(i) else 0L
    }
}

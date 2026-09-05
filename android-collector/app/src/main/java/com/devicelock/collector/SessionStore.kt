package com.devicelock.collector

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** Secure storage for staff JWT and base URL. */
class SessionStore(context: Context) {
    private val prefs = EncryptedSharedPreferences.create(
        context,
        "collector_session",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    var accessToken: String?
        get() = prefs.getString(KEY_ACCESS, null)
        set(value) = prefs.edit().putString(KEY_ACCESS, value).apply()

    var refreshToken: String?
        get() = prefs.getString(KEY_REFRESH, null)
        set(value) = prefs.edit().putString(KEY_REFRESH, value).apply()

    var email: String?
        get() = prefs.getString(KEY_EMAIL, null)
        set(value) = prefs.edit().putString(KEY_EMAIL, value).apply()

    var role: String?
        get() = prefs.getString(KEY_ROLE, null)
        set(value) = prefs.edit().putString(KEY_ROLE, value).apply()

    val isLoggedIn: Boolean get() = !accessToken.isNullOrBlank()

    // A contact (call/WhatsApp) session the collector started but hasn't logged a
    // result for yet. Persisted (not just an in-memory Activity field) so the
    // required result bottom sheet still appears if the process is killed while
    // the collector is away in the dialer/WhatsApp for a long call.
    val pendingSessionId: String? get() = prefs.getString(KEY_PENDING_SESSION, null)
    val pendingCaseId: String? get() = prefs.getString(KEY_PENDING_CASE, null)
    val pendingChannel: String? get() = prefs.getString(KEY_PENDING_CHANNEL, null)
    val pendingCustomerPhone: String? get() = prefs.getString(KEY_PENDING_PHONE, null)
    val pendingStartedAt: Long get() = prefs.getLong(KEY_PENDING_STARTED_AT, 0L)
    val hasPendingContact: Boolean get() = !pendingSessionId.isNullOrBlank()

    fun savePendingContact(
        sessionId: String,
        caseId: String,
        channel: String,
        customerPhone: String,
        startedAt: Long,
    ) {
        prefs.edit()
            .putString(KEY_PENDING_SESSION, sessionId)
            .putString(KEY_PENDING_CASE, caseId)
            .putString(KEY_PENDING_CHANNEL, channel)
            .putString(KEY_PENDING_PHONE, customerPhone)
            .putLong(KEY_PENDING_STARTED_AT, startedAt)
            .apply()
    }

    fun clearPendingContact() {
        prefs.edit()
            .remove(KEY_PENDING_SESSION)
            .remove(KEY_PENDING_CASE)
            .remove(KEY_PENDING_CHANNEL)
            .remove(KEY_PENDING_PHONE)
            .remove(KEY_PENDING_STARTED_AT)
            .apply()
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    companion object {
        private const val KEY_ACCESS = "access"
        private const val KEY_REFRESH = "refresh"
        private const val KEY_EMAIL = "email"
        private const val KEY_ROLE = "role"
        private const val KEY_PENDING_SESSION = "pending_session"
        private const val KEY_PENDING_CASE = "pending_case"
        private const val KEY_PENDING_CHANNEL = "pending_channel"
        private const val KEY_PENDING_PHONE = "pending_phone"
        private const val KEY_PENDING_STARTED_AT = "pending_started_at"
    }
}

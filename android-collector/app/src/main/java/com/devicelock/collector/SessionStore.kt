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

    fun clear() {
        prefs.edit().clear().apply()
    }

    companion object {
        private const val KEY_ACCESS = "access"
        private const val KEY_REFRESH = "refresh"
        private const val KEY_EMAIL = "email"
        private const val KEY_ROLE = "role"
    }
}

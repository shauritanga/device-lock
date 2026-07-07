package com.devicelock.agent

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Persists the agent's backend binding: the per-device token issued at
 * enrollment, the device id, and the latest FCM token.
 *
 * These are secrets — the agent token is a bearer credential — so they are kept
 * in [EncryptedSharedPreferences], encrypted with an AES-256 key held in the
 * Android Keystore (hardware-backed where available). The stored file is
 * ciphertext, so extracting the app's data does not reveal the token.
 *
 * The backend URL is deliberately NOT stored here; it is fixed at build time
 * ([BuildConfig.AGENT_BASE_URL]) so the agent can't be repointed at a rogue
 * server.
 */
class AgentStore(context: Context) {

    private val prefs: SharedPreferences = securePrefs(context.applicationContext)

    val baseUrl: String
        get() = BuildConfig.AGENT_BASE_URL.trimEnd('/')

    var agentToken: String?
        get() = prefs.getString(KEY_AGENT_TOKEN, null)
        set(value) = prefs.edit().putString(KEY_AGENT_TOKEN, value).apply()

    var deviceId: String?
        get() = prefs.getString(KEY_DEVICE_ID, null)
        set(value) = prefs.edit().putString(KEY_DEVICE_ID, value).apply()

    /** Latest FCM registration token, sent to the backend on enroll / check-in. */
    var fcmToken: String?
        get() = prefs.getString(KEY_FCM_TOKEN, null)
        set(value) = prefs.edit().putString(KEY_FCM_TOKEN, value).apply()

    /**
     * Enrollment token handed to us by the setup wizard during zero-touch / QR
     * provisioning, held until [EnrollWorker] exchanges it for an agent token.
     * Cleared once enrollment succeeds.
     */
    var pendingEnrollToken: String?
        get() = prefs.getString(KEY_PENDING_ENROLL, null)
        set(value) = prefs.edit().putString(KEY_PENDING_ENROLL, value).apply()

    val isEnrolled: Boolean
        get() = !agentToken.isNullOrBlank()

    fun clear() = prefs.edit()
        .remove(KEY_AGENT_TOKEN)
        .remove(KEY_DEVICE_ID)
        .apply()

    companion object {
        private const val SECURE_PREFS = "device_lock_agent_secure"
        private const val LEGACY_PREFS = "device_lock_agent"
        private const val KEY_AGENT_TOKEN = "agent_token"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_FCM_TOKEN = "fcm_token"
        private const val KEY_PENDING_ENROLL = "pending_enroll_token"

        /**
         * Open the encrypted store, migrating any plaintext token from an earlier
         * build. Falls back to a fresh store if the keystore state is unusable
         * (e.g. the master key was invalidated) so the app never hard-crashes on
         * a bad credential blob — worst case the agent re-enrolls.
         */
        private fun securePrefs(context: Context): SharedPreferences {
            val prefs = try {
                createEncrypted(context)
            } catch (e: Exception) {
                context.deleteSharedPreferences(SECURE_PREFS)
                createEncrypted(context)
            }
            migrateLegacy(context, prefs)
            return prefs
        }

        private fun createEncrypted(context: Context): SharedPreferences {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            return EncryptedSharedPreferences.create(
                context,
                SECURE_PREFS,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        }

        /** Move a previously plaintext-stored token into the encrypted store once. */
        private fun migrateLegacy(context: Context, secure: SharedPreferences) {
            if (secure.contains(KEY_AGENT_TOKEN)) return
            val legacy = context.getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE)
            val token = legacy.getString(KEY_AGENT_TOKEN, null) ?: return
            secure.edit()
                .putString(KEY_AGENT_TOKEN, token)
                .putString(KEY_DEVICE_ID, legacy.getString(KEY_DEVICE_ID, null))
                .putString(KEY_FCM_TOKEN, legacy.getString(KEY_FCM_TOKEN, null))
                .apply()
            // Wipe the plaintext copy so the secret no longer sits on disk in the clear.
            legacy.edit().clear().apply()
            context.deleteSharedPreferences(LEGACY_PREFS)
        }
    }
}

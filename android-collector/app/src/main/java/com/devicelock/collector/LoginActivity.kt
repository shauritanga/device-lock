package com.devicelock.collector

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.devicelock.collector.databinding.ActivityLoginBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding
    private lateinit var store: SessionStore
    private lateinit var api: ApiClient

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        val granted = result.values.all { it }
        if (!granted) {
            Toast.makeText(
                this,
                "Call log & SMS permissions are needed for verified follow-ups",
                Toast.LENGTH_LONG,
            ).show()
        }
        goToHome()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)
        store = SessionStore(this)
        api = ApiClient(store = store)

        if (store.isLoggedIn) {
            ensurePermissionsThenHome()
            return
        }

        binding.btnSignIn.setOnClickListener { signIn() }
    }

    private fun signIn() {
        val email = binding.inputEmail.text?.toString().orEmpty()
        val password = binding.inputPassword.text?.toString().orEmpty()
        if (email.isBlank() || password.isBlank()) {
            showError("Email and password required")
            return
        }
        binding.btnSignIn.isEnabled = false
        binding.txtError.visibility = View.GONE
        lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) { api.login(email, password) }
                ensurePermissionsThenHome()
            } catch (e: Exception) {
                showError(e.message ?: "Login failed")
            } finally {
                binding.btnSignIn.isEnabled = true
            }
        }
    }

    private fun ensurePermissionsThenHome() {
        val needed = arrayOf(
            Manifest.permission.READ_CALL_LOG,
            Manifest.permission.READ_SMS,
            Manifest.permission.CALL_PHONE,
        )
        val missing = needed.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) {
            goToHome()
            return
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.consent_title)
            .setMessage(R.string.consent_body)
            .setPositiveButton(R.string.grant_permissions) { _, _ ->
                permissionLauncher.launch(missing.toTypedArray())
            }
            .setNegativeButton(android.R.string.cancel) { _, _ -> goToHome() }
            .show()
    }

    private fun goToHome() {
        startActivity(Intent(this, HomeActivity::class.java))
        finish()
    }

    private fun showError(msg: String) {
        binding.txtError.text = msg
        binding.txtError.visibility = View.VISIBLE
    }
}

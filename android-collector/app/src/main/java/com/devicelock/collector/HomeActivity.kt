package com.devicelock.collector

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.devicelock.collector.databinding.ActivityHomeBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Job Overview home — matches the collections dashboard mock:
 * case summary cards + today's performance statistics.
 */
class HomeActivity : AppCompatActivity() {

    private lateinit var binding: ActivityHomeBinding
    private lateinit var store: SessionStore
    private lateinit var api: ApiClient

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityHomeBinding.inflate(layoutInflater)
        setContentView(binding.root)
        supportActionBar?.hide()

        store = SessionStore(this)
        api = ApiClient(store = store)

        if (!store.isLoggedIn) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        bindDate()
        binding.swipe.setOnRefreshListener { load() }
        binding.cardCaseList.setOnClickListener {
            startActivity(Intent(this, QueueActivity::class.java))
        }
        binding.cardExtension.setOnClickListener {
            startActivity(
                Intent(this, QueueActivity::class.java)
                    .putExtra(QueueActivity.EXTRA_FILTER, "PROMISED"),
            )
        }
        binding.cardSettlement.setOnClickListener {
            Toast.makeText(this, "Settled cases open from web reports for now", Toast.LENGTH_SHORT)
                .show()
        }

        // Long-press header area for logout
        binding.txtDate.setOnLongClickListener {
            confirmLogout()
            true
        }

        load()
    }

    override fun onResume() {
        super.onResume()
        if (store.isLoggedIn) load()
    }

    private fun bindDate() {
        val now = Date()
        binding.txtDate.text = SimpleDateFormat("dd/MMM/yyyy", Locale.ENGLISH).format(now)
        binding.txtWeekday.text = SimpleDateFormat("EEEE", Locale.ENGLISH).format(now)
    }

    private fun load() {
        lifecycleScope.launch {
            try {
                val casesDeferred = async(Dispatchers.IO) { api.myQueue() }
                val perfDeferred = async(Dispatchers.IO) {
                    runCatching { api.todayPerformance() }.getOrNull()
                }
                val cases = casesDeferred.await()
                val perf = perfDeferred.await()

                val outstanding = cases.size
                val promised = cases.count { it.status == "PROMISED" }
                // Settlement: not in open queue; show 0 or follow-ups completed today as proxy
                val settled = 0

                binding.txtPendingCount.text = outstanding.toString()
                binding.txtPromiseCount.text = promised.toString()
                binding.txtSettledCount.text = settled.toString()

                val phone = perf?.callsCount ?: 0
                val sms = perf?.smsCount ?: 0
                val wa = perf?.whatsappCount ?: 0
                val total = phone + sms + wa
                val talk = perf?.talkSeconds ?: 0

                binding.txtPhoneCollections.text = phone.toString()
                binding.txtSmsCollections.text = sms.toString()
                binding.txtWaCollections.text = wa.toString()
                binding.txtTotalCollections.text = total.toString()
                binding.txtCallDuration.text = talk.toString()
            } catch (e: Exception) {
                Toast.makeText(this@HomeActivity, e.message ?: "Load failed", Toast.LENGTH_LONG)
                    .show()
                if (e.message?.contains("Unauthorized", ignoreCase = true) == true ||
                    e.message?.contains("401") == true
                ) {
                    store.clear()
                    startActivity(Intent(this@HomeActivity, LoginActivity::class.java))
                    finish()
                }
            } finally {
                binding.swipe.isRefreshing = false
            }
        }
    }

    private fun confirmLogout() {
        AlertDialog.Builder(this)
            .setTitle(R.string.logout)
            .setMessage(store.email ?: "Sign out?")
            .setPositiveButton(R.string.logout) { _, _ ->
                store.clear()
                startActivity(Intent(this, LoginActivity::class.java))
                finish()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }
}

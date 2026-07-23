package com.devicelock.collector

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.devicelock.collector.databinding.ActivityQueueBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class QueueActivity : AppCompatActivity() {

    private lateinit var binding: ActivityQueueBinding
    private lateinit var store: SessionStore
    private lateinit var api: ApiClient
    private val adapter = CaseAdapter { openCase(it) }
    private var statusFilter: String? = null
    private var allCases: List<QueueCase> = emptyList()
    private var currentPage = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityQueueBinding.inflate(layoutInflater)
        setContentView(binding.root)
        supportActionBar?.hide()
        store = SessionStore(this)
        api = ApiClient(store = store)
        statusFilter = intent.getStringExtra(EXTRA_FILTER)

        if (!store.isLoggedIn) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        binding.list.layoutManager = LinearLayoutManager(this)
        binding.list.adapter = adapter
        binding.swipe.setOnRefreshListener { load() }
        binding.btnRefresh.setOnClickListener { load() }
        binding.btnBack.setOnClickListener { finish() }
        binding.btnPrevPage.setOnClickListener { goToPage(currentPage - 1) }
        binding.btnNextPage.setOnClickListener { goToPage(currentPage + 1) }
        binding.filterCard.setOnClickListener {
            val label = statusFilter?.prettyStatus() ?: "All assigned cases"
            Toast.makeText(this, label, Toast.LENGTH_SHORT).show()
        }
        load()
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }

    override fun onResume() {
        super.onResume()
        if (store.isLoggedIn) load()
    }

    private fun load() {
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val cases = withContext(Dispatchers.IO) { api.myQueue() }
                    .let { list ->
                        val f = statusFilter
                        if (f.isNullOrBlank()) list else list.filter { it.status == f }
                    }
                allCases = cases
                currentPage = 0
                renderPage()
                binding.txtFilterSubtitle.text = statusFilter?.prettyStatus() ?: "Click to expand / collapse"
                binding.txtEmpty.visibility = if (cases.isEmpty()) View.VISIBLE else View.GONE
            } catch (e: Exception) {
                Toast.makeText(this@QueueActivity, e.message ?: "Load failed", Toast.LENGTH_LONG).show()
                if (e.message?.contains("401") == true || e.message?.contains("Unauthorized") == true) {
                    store.clear()
                    startActivity(Intent(this@QueueActivity, LoginActivity::class.java))
                    finish()
                }
            } finally {
                binding.progress.visibility = View.GONE
                binding.swipe.isRefreshing = false
            }
        }
    }

    private fun openCase(item: QueueCase) {
        startActivity(
            Intent(this, CaseActivity::class.java).putExtra(CaseActivity.EXTRA_CASE_ID, item.id),
        )
    }

    private fun renderPage() {
        val pageCount = pageCount()
        if (pageCount == 0) {
            adapter.submit(emptyList())
            renderPager(0)
            return
        }
        currentPage = currentPage.coerceIn(0, pageCount - 1)
        val start = currentPage * PAGE_SIZE
        adapter.submit(allCases.drop(start).take(PAGE_SIZE))
        renderPager(pageCount)
    }

    private fun goToPage(page: Int) {
        if (page !in 0 until pageCount()) return
        currentPage = page
        renderPage()
    }

    private fun pageCount(): Int =
        if (allCases.isEmpty()) 0 else ((allCases.size - 1) / PAGE_SIZE) + 1

    private fun renderPager(pageCount: Int) {
        binding.pageStrip.removeAllViews()
        val pages = pageCount.coerceAtMost(5)
        repeat(pages) { i ->
            val page = TextView(this).apply {
                text = (i + 1).toString()
                gravity = Gravity.CENTER
                textSize = 15f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                setTextColor(if (i == currentPage) Color.WHITE else Color.parseColor("#64748B"))
                setBackgroundResource(if (i == currentPage) R.drawable.bg_page_selected else 0)
                setOnClickListener { goToPage(i) }
            }
            binding.pageStrip.addView(
                page,
                ViewGroup.MarginLayoutParams(46.dp(), 46.dp()).apply {
                    marginStart = 3.dp()
                    marginEnd = 3.dp()
                },
            )
        }
        binding.pager.visibility = if (pageCount > 1) View.VISIBLE else View.GONE
        binding.btnPrevPage.alpha = if (currentPage > 0) 1f else 0.35f
        binding.btnNextPage.alpha = if (currentPage < pageCount - 1) 1f else 0.35f
    }

    companion object {
        const val EXTRA_FILTER = "status_filter"
        private const val PAGE_SIZE = 8
    }
}

private class CaseAdapter(
    private val onClick: (QueueCase) -> Unit,
) : RecyclerView.Adapter<CaseAdapter.VH>() {
    private val items = mutableListOf<QueueCase>()

    fun submit(list: List<QueueCase>) {
        items.clear()
        items.addAll(list)
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_case, parent, false)
        return VH(view)
    }

    override fun getItemCount() = items.size

    override fun onBindViewHolder(holder: VH, position: Int) {
        holder.bind(items[position], onClick)
    }

    class VH(view: View) : RecyclerView.ViewHolder(view) {
        private val caseNo: TextView = view.findViewById(R.id.txtCaseNo)
        private val status: TextView = view.findViewById(R.id.txtStatus)
        private val level: TextView = view.findViewById(R.id.txtLevel)
        private val product: TextView = view.findViewById(R.id.txtProduct)

        fun bind(item: QueueCase, onClick: (QueueCase) -> Unit) {
            caseNo.text = item.id.caseNumber()
            status.text = item.status.prettyStatus()
            level.text = tierFor(item.daysOverdue)
            product.text = item.deviceModel ?: item.companyName ?: "Device loan"
            itemView.setOnClickListener { onClick(item) }
        }

        private fun tierFor(daysOverdue: Int): String =
            when {
                daysOverdue >= 30 -> "T3"
                daysOverdue >= 7 -> "T2"
                else -> "T1"
            }
    }
}

private fun String.caseNumber(): String {
    val digits = filter { it.isDigit() }
    if (digits.length >= 5) return digits.takeLast(5)
    return take(5).uppercase()
}

private fun String.prettyStatus(): String =
    lowercase()
        .split('_', '-', ' ')
        .filter { it.isNotBlank() }
        .joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }
        .ifBlank { "In Progress" }

private fun Int.dp(): Int =
    (this * android.content.res.Resources.getSystem().displayMetrics.density).toInt()

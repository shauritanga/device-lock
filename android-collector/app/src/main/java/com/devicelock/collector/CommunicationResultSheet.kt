package com.devicelock.collector

import android.Manifest
import android.app.DatePickerDialog
import android.app.Dialog
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.devicelock.collector.databinding.BottomsheetCommunicationResultBinding
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

/**
 * Forced the moment the collector returns to the app after a call/WhatsApp
 * contact: cannot be swiped away or backed out of without submitting a
 * collection record (method, remark, result).
 */
class CommunicationResultSheet : BottomSheetDialogFragment() {

    private var _binding: BottomsheetCommunicationResultBinding? = null
    private val binding get() = _binding!!

    private lateinit var store: SessionStore
    private lateinit var api: ApiClient

    private var sessionId: String = ""
    private var caseId: String = ""
    private var channel: String = ""
    private var customerPhone: String = ""
    private var sessionStartedAt: Long = 0L
    private var pickedDueDateIso: String? = null

    /** Filled in the background if a matching device call-log entry is found. */
    private var logMatch: LogMatch? = null

    var onSubmitted: (() -> Unit)? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        isCancelable = false
        arguments?.let {
            sessionId = it.getString(ARG_SESSION_ID, "")
            caseId = it.getString(ARG_CASE_ID, "")
            channel = it.getString(ARG_CHANNEL, "")
            customerPhone = it.getString(ARG_CUSTOMER_PHONE, "")
            sessionStartedAt = it.getLong(ARG_STARTED_AT, System.currentTimeMillis())
        }
    }

    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog {
        val dialog = super.onCreateDialog(savedInstanceState) as BottomSheetDialog
        dialog.setCanceledOnTouchOutside(false)
        dialog.setOnShowListener {
            val sheet = dialog.findViewById<View>(com.google.android.material.R.id.design_bottom_sheet)
            sheet?.let {
                val behavior = BottomSheetBehavior.from(it)
                behavior.isDraggable = false
                behavior.state = BottomSheetBehavior.STATE_EXPANDED
                behavior.skipCollapsed = true
            }
        }
        return dialog
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ): View {
        _binding = BottomsheetCommunicationResultBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        store = SessionStore(requireContext())
        api = ApiClient(store = store)

        binding.txtSheetSubtitle.text = "Method: ${channelLabel(channel)}"

        binding.radioResult.setOnCheckedChangeListener { _, checkedId ->
            binding.groupRepayment.visibility =
                if (checkedId == R.id.optRepaymentCommitted) View.VISIBLE else View.GONE
            binding.txtSheetError.visibility = View.GONE
        }
        binding.inputPromiseDate.setOnClickListener { showDatePicker() }
        binding.btnSubmitResult.setOnClickListener { submit() }

        if (channel == "CALL") findCallLogMatchInBackground()
    }

    private fun findCallLogMatchInBackground() {
        val granted = ContextCompat.checkSelfPermission(
            requireContext(),
            Manifest.permission.READ_CALL_LOG,
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted || customerPhone.isBlank()) return
        lifecycleScope.launch {
            logMatch = withContext(Dispatchers.IO) {
                runCatching {
                    LogMatcher.findCallMatch(requireContext(), customerPhone, sessionStartedAt)
                }.getOrNull()
            }
        }
    }

    private fun showDatePicker() {
        val cal = Calendar.getInstance()
        DatePickerDialog(
            requireContext(),
            { _, year, month, day ->
                cal.set(year, month, day)
                pickedDueDateIso = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(cal.time)
                binding.inputPromiseDate.setText(
                    SimpleDateFormat("dd MMM yyyy", Locale.ENGLISH).format(cal.time),
                )
            },
            cal.get(Calendar.YEAR),
            cal.get(Calendar.MONTH),
            cal.get(Calendar.DAY_OF_MONTH),
        ).show()
    }

    private fun selectedResult(): String? = when (binding.radioResult.checkedRadioButtonId) {
        R.id.optConnected -> "CONNECTED"
        R.id.optNotConnected -> "NOT_CONNECTED"
        R.id.optRepaymentCommitted -> "REPAYMENT_COMMITTED"
        R.id.optSuspectedFraud -> "SUSPECTED_FRAUD"
        R.id.optOther -> "OTHER"
        else -> null
    }

    private fun showError(message: String) {
        binding.txtSheetError.text = message
        binding.txtSheetError.visibility = View.VISIBLE
    }

    private fun submit() {
        val result = selectedResult()
        if (result == null) {
            showError("Choose a communication result")
            return
        }
        val amount = binding.inputPromiseAmount.text?.toString()?.trim()?.toDoubleOrNull()
        if (result == "REPAYMENT_COMMITTED" && (amount == null || amount <= 0 || pickedDueDateIso == null)) {
            showError("Enter the promised amount and due date")
            return
        }
        binding.txtSheetError.visibility = View.GONE
        binding.btnSubmitResult.isEnabled = false

        val remark = binding.inputRemark.text?.toString()?.trim().orEmpty()
        val match = logMatch
        val durationSeconds = match?.durationSeconds
            ?: ((System.currentTimeMillis() - sessionStartedAt) / 1000).coerceAtLeast(0).toInt()
        val deviceMatchMeta: JSONObject? = match?.let {
            JSONObject()
                .put("source", "android-collector")
                .put("matchedPhone", it.matchedPhone)
                .put("logAt", it.logAtIso)
        }

        viewLifecycleOwner.lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    api.completeContact(
                        sessionId = sessionId,
                        communicationResult = result,
                        durationSeconds = durationSeconds,
                        outcomeNote = remark.ifBlank { null },
                        deviceMatchMeta = deviceMatchMeta,
                    )
                    if (result == "REPAYMENT_COMMITTED") {
                        api.createPromise(caseId, amount!!, pickedDueDateIso!!, remark.ifBlank { null })
                    }
                }
                store.clearPendingContact()
                onSubmitted?.invoke()
                dismissAllowingStateLoss()
            } catch (e: Exception) {
                showError(e.message ?: "Could not submit — try again")
                binding.btnSubmitResult.isEnabled = true
            }
        }
    }

    private fun channelLabel(channel: String): String = when (channel) {
        "CALL" -> "Call"
        "WHATSAPP" -> "WhatsApp"
        "SMS" -> "SMS"
        else -> channel
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    companion object {
        const val TAG = "CommunicationResultSheet"

        private const val ARG_SESSION_ID = "session_id"
        private const val ARG_CASE_ID = "case_id"
        private const val ARG_CHANNEL = "channel"
        private const val ARG_CUSTOMER_PHONE = "customer_phone"
        private const val ARG_STARTED_AT = "started_at"

        fun newInstance(
            sessionId: String,
            caseId: String,
            channel: String,
            customerPhone: String,
            sessionStartedAt: Long,
        ) = CommunicationResultSheet().apply {
            arguments = Bundle().apply {
                putString(ARG_SESSION_ID, sessionId)
                putString(ARG_CASE_ID, caseId)
                putString(ARG_CHANNEL, channel)
                putString(ARG_CUSTOMER_PHONE, customerPhone)
                putLong(ARG_STARTED_AT, sessionStartedAt)
            }
        }
    }
}

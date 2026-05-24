package com.motivador.diario.ui

import android.Manifest
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.graphics.Paint
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.motivador.diario.R
import com.motivador.diario.data.MotivadorRepository
import com.motivador.diario.data.PhraseEntity
import com.motivador.diario.databinding.ActivityMainBinding
import com.motivador.diario.worker.FetchPhraseWorker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import retrofit2.HttpException
import java.net.URLEncoder

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var repo: MotivadorRepository
    private lateinit var prefs: SharedPreferences
    private val adapter = PhraseAdapter()
    private var syncJob: Job? = null

    private val requestNotificationsPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { _ ->
        // No-op: the next sync will use the latest permission state.
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        repo = MotivadorRepository(this)
        prefs = getSharedPreferences(SettingsActivity.PREFS_NAME, MODE_PRIVATE)

        binding.historyList.layoutManager = LinearLayoutManager(this)
        binding.historyList.adapter = adapter

        binding.btnRefresh.setOnClickListener {
            syncAvailablePhrases(force = true, initiatedByUser = true)
        }

        binding.btnSettings.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }

        ensureNotificationsPermission()
        updateRefreshButtonVisibility()
        refreshFromCache()
        syncAvailablePhrases(force = false, initiatedByUser = false)
    }

    override fun onResume() {
        super.onResume()
        updateRefreshButtonVisibility()
        refreshFromCache()
        syncAvailablePhrases(force = false, initiatedByUser = false)
    }

    private fun refreshFromCache() {
        lifecycleScope.launch {
            val today = withContext(Dispatchers.IO) { repo.getTodayPhrases() }
            renderTodayPhrases(today)

            if (today.isEmpty()) {
                setSyncStatus(repo.nextExpectedWindowLabel())
            }
        }
    }

    private fun syncAvailablePhrases(force: Boolean, initiatedByUser: Boolean) {
        syncJob?.cancel()
        syncJob = lifecycleScope.launch {
            val availablePeriods = repo.currentAvailablePeriods()
            if (availablePeriods.isEmpty()) {
                val today = withContext(Dispatchers.IO) { repo.getTodayPhrases() }
                renderTodayPhrases(today)
                setSyncStatus(repo.nextExpectedWindowLabel())
                return@launch
            }

            setRefreshLoading(initiatedByUser, true)

            var inserted = 0
            var pendingRelease = false
            var hadNetworkFailure = false
            var attemptedRequests = 0

            try {
                withContext(Dispatchers.IO) {
                    for (periodo in availablePeriods) {
                        if (!force && repo.hasTodayPhrase(periodo)) {
                            continue
                        }

                        attemptedRequests += 1

                        try {
                            val result = repo.fetchAndCache(periodo)
                            if (result.inserted) {
                                inserted += 1
                            }
                        } catch (e: HttpException) {
                            if (e.code() == 404) {
                                pendingRelease = true
                            } else {
                                throw e
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                if (e is CancellationException) {
                    throw e
                }
                hadNetworkFailure = true
            } finally {
                setRefreshLoading(initiatedByUser, false)
            }

            val today = withContext(Dispatchers.IO) { repo.getTodayPhrases() }
            renderTodayPhrases(today)

            val statusMessage = when {
                inserted > 0 -> "Frases do dia sincronizadas agora."
                today.isNotEmpty() && hadNetworkFailure -> "Sem conexao. Exibindo frases salvas."
                today.isNotEmpty() && pendingRelease -> "Conteudo atual salvo. A proxima frase ainda nao foi liberada."
                today.isNotEmpty() && attemptedRequests == 0 -> "Frases do dia ja estao atualizadas."
                today.isNotEmpty() -> "Sincronizacao concluida."
                hadNetworkFailure -> "Nao foi possivel conectar ao servidor."
                pendingRelease -> "Aguardando a liberacao da frase do periodo."
                else -> repo.nextExpectedWindowLabel()
            }

            setSyncStatus(
                statusMessage,
                isError = today.isEmpty() && hadNetworkFailure
            )
        }
    }

    private fun updateRefreshButtonVisibility() {
        val showButton = prefs.getBoolean(SettingsActivity.KEY_SHOW_REFRESH_BUTTON, false)
        binding.btnRefresh.visibility = if (showButton) View.VISIBLE else View.GONE
    }

    private fun setRefreshLoading(isVisibleAction: Boolean, loading: Boolean) {
        if (!isVisibleAction) return

        binding.btnRefresh.isEnabled = !loading
        binding.btnRefresh.alpha = if (loading) 0.6f else 1.0f
        binding.btnRefresh.text = if (loading) {
            "Sincronizando..."
        } else {
            "Sincronizar agora"
        }
    }

    private fun setSyncStatus(message: String, isError: Boolean = false) {
        binding.syncStatus.visibility = View.VISIBLE
        binding.syncStatus.text = message
        val colorRes = if (isError) R.color.evening_color else R.color.text_secondary
        binding.syncStatus.setTextColor(ContextCompat.getColor(this, colorRes))
    }

    private fun ensureNotificationsPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return

        val granted = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            requestNotificationsPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun renderTodayPhrases(today: List<PhraseEntity>) {
        if (today.isNotEmpty()) {
            val latestPhrase = today.maxByOrNull { it.receivedAt }

            if (latestPhrase != null) {
                renderMainPhrase(
                    latestPhrase.texto,
                    latestPhrase.autor,
                    formatPeriodoLabel(latestPhrase.periodo)
                )

                val previousPhrases = today.filter { it.localId != latestPhrase.localId }
                if (previousPhrases.isNotEmpty()) {
                    binding.historyTitle.visibility = View.VISIBLE
                    adapter.submitList(previousPhrases)
                } else {
                    binding.historyTitle.visibility = View.GONE
                    adapter.submitList(emptyList())
                }
                return
            }
        }

        renderMainPhrase("Aguardando frase de hoje...", "", "")
        binding.historyTitle.visibility = View.GONE
        adapter.submitList(emptyList())
    }

    private fun formatPeriodoLabel(periodo: String): String {
        return when (periodo) {
            FetchPhraseWorker.PERIODO_MANHA -> "Motivacao da manha (05:00)"
            FetchPhraseWorker.PERIODO_TARDE -> "Motivacao da tarde (18:00)"
            else -> ""
        }
    }

    private fun renderMainPhrase(text: String, author: String, meta: String) {
        binding.phraseText.text = text

        if (author.isNotBlank()) {
            binding.phraseAuthor.text = "- $author"
            binding.phraseAuthor.setTextColor(
                ContextCompat.getColor(this, R.color.accent_color)
            )
            binding.phraseAuthor.paintFlags =
                binding.phraseAuthor.paintFlags or Paint.UNDERLINE_TEXT_FLAG
            binding.phraseAuthor.setOnClickListener {
                openAuthorSearch(author)
            }
        } else {
            binding.phraseAuthor.text = ""
            binding.phraseAuthor.setTextColor(
                ContextCompat.getColor(this, R.color.text_secondary)
            )
            binding.phraseAuthor.paintFlags =
                binding.phraseAuthor.paintFlags and Paint.UNDERLINE_TEXT_FLAG.inv()
            binding.phraseAuthor.setOnClickListener(null)
        }

        binding.phraseMeta.text = meta
    }

    private fun openAuthorSearch(author: String) {
        try {
            val q = URLEncoder.encode(author, "UTF-8")
            val url = "https://www.google.com/search?q=$q"
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            intent.addCategory(Intent.CATEGORY_BROWSABLE)
            startActivity(intent)
        } catch (_: Exception) {
            // Keep the main screen usable even if no browser is available.
        }
    }
}

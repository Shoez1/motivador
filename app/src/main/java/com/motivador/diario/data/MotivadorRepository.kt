package com.motivador.diario.data

import android.content.Context
import com.motivador.diario.network.NetworkModule
import com.motivador.diario.network.TestDto
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class MotivadorRepository(private val context: Context) {
    private val db = AppDatabase.get(context)
    private val dao = db.phraseDao()
    private val api = NetworkModule.api(context)
    private val brasiliaTimeZone: TimeZone = TimeZone.getTimeZone("America/Sao_Paulo")

    suspend fun fetchAndCache(periodo: String): FetchAndCacheResult {
        val localDate = todayKey()
        val dto = api.getPhrase(periodo)
        val existing = dao.findByRemotePeriodAndDate(dto.id, periodo, localDate)
        if (existing != null) {
            return FetchAndCacheResult(existing, inserted = false)
        }

        val entity = PhraseEntity(
            remoteId = dto.id,
            texto = dto.texto,
            autor = dto.autor,
            tipo = dto.tipo,
            periodo = periodo,
            receivedAt = System.currentTimeMillis(),
            localDate = localDate
        )

        val localId = dao.insert(entity)
        val stored = if (localId != -1L) {
            entity.copy(localId = localId)
        } else {
            dao.findByRemotePeriodAndDate(dto.id, periodo, localDate) ?: entity
        }

        return FetchAndCacheResult(stored, inserted = localId != -1L)
    }

    suspend fun markPhraseNotified(phrase: PhraseEntity) {
        if (phrase.localId == 0L || phrase.notifiedAt != null) {
            return
        }
        dao.markNotified(phrase.localId, System.currentTimeMillis())
    }

    suspend fun testServer(): TestDto = api.test()

    suspend fun getLastOrNull(): PhraseEntity? = dao.last()

    suspend fun getRecent(limit: Int = 20): List<PhraseEntity> = dao.recent(limit)

    suspend fun hasTodayPhrase(periodo: String): Boolean {
        return dao.hasPhraseForDate(todayKey(), periodo)
    }

    suspend fun getTodayPhrases(): List<PhraseEntity> {
        return dao.getPhrasesForDate(todayKey())
    }

    /** Remove frases de dias anteriores. Chamar apenas no startup do app. */
    suspend fun purgeOldPhrases() {
        dao.deleteBeforeLocalDate(todayKey())
    }

    fun currentAvailablePeriods(): List<String> {
        val hour = currentBrasiliaHour()
        return when {
            hour >= 18 -> listOf("manha", "tarde")
            hour >= 5 -> listOf("manha")
            else -> emptyList()
        }
    }

    fun nextExpectedWindowLabel(): String {
        return when (currentBrasiliaHour()) {
            in 0..4 -> "Próxima frase prevista às 05:00 (horário de Brasília)."
            in 5..17 -> "Próxima frase prevista às 18:00 (horário de Brasília)."
            else -> "Novas frases a partir das 05:00 (horário de Brasília) de amanhã."
        }
    }

    private fun currentBrasiliaHour(): Int {
        return Calendar.getInstance(brasiliaTimeZone).get(Calendar.HOUR_OF_DAY)
    }

    private fun todayKey(now: Date = Date()): String {
        val formatter = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        formatter.timeZone = brasiliaTimeZone
        return formatter.format(now)
    }
}

data class FetchAndCacheResult(
    val phrase: PhraseEntity,
    val inserted: Boolean
)

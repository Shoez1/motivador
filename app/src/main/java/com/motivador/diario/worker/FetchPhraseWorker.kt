package com.motivador.diario.worker

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.motivador.diario.data.MotivadorRepository
import com.motivador.diario.notification.NotificationHelper
import retrofit2.HttpException

class FetchPhraseWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val periodo = inputData.getString(KEY_PERIODO) ?: return Result.failure()

        return try {
            val repo = MotivadorRepository(applicationContext)
            val result = repo.fetchAndCache(periodo)
            val phrase = result.phrase

            if (phrase.notifiedAt == null) {
                val title = when (periodo) {
                    PERIODO_MANHA -> "Motivacao da manha (05:00)"
                    PERIODO_TARDE -> "Motivacao da tarde (18:00)"
                    else -> "Motivador Diario"
                }

                val notified = NotificationHelper.showPhraseNotification(
                    applicationContext,
                    title = title,
                    text = phrase.texto,
                    author = phrase.autor
                )

                if (notified) {
                    repo.markPhraseNotified(phrase)

                    val prefs = applicationContext.getSharedPreferences(
                        "motivador_prefs",
                        Context.MODE_PRIVATE
                    )
                    prefs.edit()
                        .putLong("last_notification_time", System.currentTimeMillis())
                        .putString("last_notification_periodo", periodo)
                        .apply()
                }
            }

            Result.success()
        } catch (e: Exception) {
            if (e is HttpException) {
                if (e.code() == 404) {
                    return Result.success()
                }
                if (e.code() in 400..499) {
                    return Result.failure()
                }
            }

            Result.retry()
        }
    }

    companion object {
        const val KEY_PERIODO = "periodo"
        const val PERIODO_MANHA = "manha"
        const val PERIODO_TARDE = "tarde"
    }
}

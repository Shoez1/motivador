package com.motivador.diario.worker

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.PeriodicWorkRequest
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.util.Calendar
import java.util.TimeZone
import java.util.concurrent.TimeUnit

object DailyScheduler {
    private const val UNIQUE_MANHA = "motivador_manha"
    private const val UNIQUE_TARDE = "motivador_tarde"

    fun scheduleDailyWork(context: Context) {
        val wm = WorkManager.getInstance(context)

        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val manha = buildDailyWorker(
            hour = 5,
            minute = 0,
            periodo = FetchPhraseWorker.PERIODO_MANHA,
            constraints = constraints
        )

        val tarde = buildDailyWorker(
            hour = 18,
            minute = 0,
            periodo = FetchPhraseWorker.PERIODO_TARDE,
            constraints = constraints
        )

        // UPDATE garante que mudanças no initialDelay (ex: após atualização do app)
        // sejam aplicadas. KEEP ignoraria o novo worker se um já estiver enfileirado.
        wm.enqueueUniquePeriodicWork(UNIQUE_MANHA, ExistingPeriodicWorkPolicy.UPDATE, manha)
        wm.enqueueUniquePeriodicWork(UNIQUE_TARDE, ExistingPeriodicWorkPolicy.UPDATE, tarde)
    }

    private fun buildDailyWorker(
        hour: Int,
        minute: Int,
        periodo: String,
        constraints: Constraints
    ): PeriodicWorkRequest {
        val initialDelayMs = computeInitialDelayMillis(hour, minute)

        return PeriodicWorkRequestBuilder<FetchPhraseWorker>(24, TimeUnit.HOURS)
            .setConstraints(constraints)
            .setInitialDelay(initialDelayMs, TimeUnit.MILLISECONDS)
            .setInputData(workDataOf(FetchPhraseWorker.KEY_PERIODO to periodo))
            .build()
    }

    private fun computeInitialDelayMillis(hour: Int, minute: Int): Long {
        val brasiliaTimeZone = TimeZone.getTimeZone("America/Sao_Paulo")
        val now = Calendar.getInstance(brasiliaTimeZone)
        val next = Calendar.getInstance(brasiliaTimeZone).apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }

        if (!next.after(now)) {
            next.add(Calendar.DAY_OF_YEAR, 1)
        }

        return next.timeInMillis - now.timeInMillis
    }
}

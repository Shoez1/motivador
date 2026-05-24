package com.motivador.diario.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.motivador.diario.worker.DailyScheduler
import com.motivador.diario.worker.FetchPhraseWorker
import java.util.Calendar
import java.util.TimeZone

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action

        val isInstallEvent = action == Intent.ACTION_PACKAGE_ADDED &&
            intent.data?.schemeSpecificPart == context.packageName

        if (action == Intent.ACTION_BOOT_COMPLETED || 
            action == Intent.ACTION_MY_PACKAGE_REPLACED ||
            action == Intent.ACTION_PACKAGE_REPLACED ||
            isInstallEvent) {
            
            // Agenda os trabalhos diários quando o celular liga
            DailyScheduler.scheduleDailyWork(context)

            val tz = TimeZone.getTimeZone("America/Sao_Paulo")
            val now = Calendar.getInstance(tz)
            val hour = now.get(Calendar.HOUR_OF_DAY)

            if (hour >= 5) {
                enqueueImmediateFetch(context, FetchPhraseWorker.PERIODO_MANHA, "motivador_boot_fetch_manha")
            }

            if (hour >= 18) {
                enqueueImmediateFetch(context, FetchPhraseWorker.PERIODO_TARDE, "motivador_boot_fetch_tarde")
            }
        }
    }

    private fun enqueueImmediateFetch(context: Context, periodo: String, uniqueName: String) {
        val request = OneTimeWorkRequestBuilder<FetchPhraseWorker>()
            .setInputData(workDataOf(FetchPhraseWorker.KEY_PERIODO to periodo))
            .build()

        WorkManager.getInstance(context)
            .enqueueUniqueWork(uniqueName, ExistingWorkPolicy.REPLACE, request)
    }
}

package com.motivador.diario

import android.app.Application
import androidx.lifecycle.lifecycleScope
import com.motivador.diario.data.MotivadorRepository
import com.motivador.diario.notification.NotificationHelper
import com.motivador.diario.worker.DailyScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class MotivadorApp : Application() {

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        NotificationHelper.ensureChannel(this)
        DailyScheduler.scheduleDailyWork(this)

        // Purga frases antigas uma única vez no startup — evita chamadas repetidas no Repository.
        appScope.launch {
            try {
                MotivadorRepository(this@MotivadorApp).purgeOldPhrases()
            } catch (_: Exception) {
                // Não crítico: a purga falhando não impede o app de funcionar.
            }
        }
    }
}

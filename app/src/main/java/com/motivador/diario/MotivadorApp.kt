package com.motivador.diario

import android.app.Application
import com.motivador.diario.notification.NotificationHelper
import com.motivador.diario.worker.DailyScheduler

class MotivadorApp : Application() {
    override fun onCreate() {
        super.onCreate()
        NotificationHelper.ensureChannel(this)
        DailyScheduler.scheduleDailyWork(this)
    }
}

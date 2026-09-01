package com.motivador.diario.network

import com.motivador.diario.BuildConfig

object ApiConfig {
    const val BASE_URL = "https://motivador.sysdev2.serv00.net/"
    val API_KEY: String get() = BuildConfig.MOTIVADOR_API_KEY
    const val TIMEOUT_SECONDS = 30L
}

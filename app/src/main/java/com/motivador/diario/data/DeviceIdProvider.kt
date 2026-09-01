package com.motivador.diario.data

import android.annotation.SuppressLint
import android.content.Context
import android.provider.Settings
import java.util.UUID

object DeviceIdProvider {

    private const val PREFS_NAME = "motivador_device"
    private const val KEY_DEVICE_ID = "device_id"

    // ANDROID_ID pode ser nulo, ter o valor padrão de fábrica "9774d56d682e549c"
    // (em aparelhos resetados), ou ser inválido em emuladores. Nesses casos
    // geramos e persistimos um UUID aleatório como fallback.
    private val INVALID_IDS = setOf("9774d56d682e549c", "0000000000000000", "unknown", "")

    @SuppressLint("HardwareIds")
    fun getDeviceId(context: Context): String {
        val androidId = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ANDROID_ID
        )?.trim() ?: ""

        if (androidId.length >= 8 && androidId !in INVALID_IDS) {
            return androidId
        }

        return getOrCreateFallbackId(context)
    }

    private fun getOrCreateFallbackId(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val stored = prefs.getString(KEY_DEVICE_ID, null)
        if (!stored.isNullOrBlank()) {
            return stored
        }
        val generated = UUID.randomUUID().toString()
        prefs.edit().putString(KEY_DEVICE_ID, generated).apply()
        return generated
    }
}

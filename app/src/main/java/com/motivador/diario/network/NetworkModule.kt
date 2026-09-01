package com.motivador.diario.network

import android.content.Context
import com.motivador.diario.BuildConfig
import com.motivador.diario.data.DeviceIdProvider
import com.squareup.moshi.Moshi
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit

object NetworkModule {
    private const val USER_AGENT = "MotivadorDiario/1.1 (Android)"

    @Volatile
    private var apiInstance: MotivadorApi? = null

    private val moshi: Moshi by lazy { Moshi.Builder().build() }

    fun api(context: Context): MotivadorApi {
        val appContext = context.applicationContext
        return apiInstance ?: synchronized(this) {
            apiInstance ?: buildApi(appContext).also { apiInstance = it }
        }
    }

    private fun buildApi(context: Context): MotivadorApi {
        val logging = HttpLoggingInterceptor().apply {
            // Loga apenas em builds de debug para não expor dados sensíveis em produção.
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BASIC
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }

        val client = OkHttpClient.Builder()
            .connectTimeout(ApiConfig.TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .readTimeout(ApiConfig.TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .writeTimeout(ApiConfig.TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .addInterceptor { chain ->
                val deviceId = DeviceIdProvider.getDeviceId(context)
                val request = chain.request().newBuilder()
                    .header("x-api-key", ApiConfig.API_KEY)
                    .header("x-device-id", deviceId)
                    .header("User-Agent", USER_AGENT)
                    .build()
                chain.proceed(request)
            }
            .addInterceptor(logging)
            .build()

        return Retrofit.Builder()
            .baseUrl(ApiConfig.BASE_URL)
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(MotivadorApi::class.java)
    }
}

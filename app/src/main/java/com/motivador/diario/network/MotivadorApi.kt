package com.motivador.diario.network

import retrofit2.http.GET
import retrofit2.http.Query

interface MotivadorApi {
    @GET("api/frase")
    suspend fun getPhrase(
        @Query("periodo") periodo: String
    ): PhraseDto

    @GET("api/teste")
    suspend fun test(): TestDto
}

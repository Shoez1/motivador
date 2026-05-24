package com.motivador.diario.network

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class PhraseDto(
    val id: String,
    val texto: String,
    val autor: String,
    val tipo: String
)

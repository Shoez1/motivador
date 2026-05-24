package com.motivador.diario.network

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class TestDto(
    val ok: Boolean,
    val message: String,
    val datetime_brt: String,
    val date_brt: String,
    val time_brt: String
)

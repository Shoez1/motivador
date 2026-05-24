package com.motivador.diario.data

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "phrases",
    indices = [Index(value = ["remoteId", "periodo", "localDate"], unique = true)]
)
data class PhraseEntity(
    @PrimaryKey(autoGenerate = true) val localId: Long = 0,
    val remoteId: String,
    val texto: String,
    val autor: String,
    val tipo: String,
    val periodo: String,
    val receivedAt: Long,
    val localDate: String,
    val notifiedAt: Long? = null
)

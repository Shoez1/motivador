package com.motivador.diario.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface PhraseDao {

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(entity: PhraseEntity): Long

    @Query("SELECT * FROM phrases ORDER BY receivedAt DESC LIMIT :limit")
    suspend fun recent(limit: Int): List<PhraseEntity>

    @Query("SELECT * FROM phrases ORDER BY receivedAt DESC LIMIT 1")
    suspend fun last(): PhraseEntity?

    @Query(
        """
        SELECT * FROM phrases
        WHERE remoteId = :remoteId AND periodo = :periodo AND localDate = :localDate
        LIMIT 1
        """
    )
    suspend fun findByRemotePeriodAndDate(
        remoteId: String,
        periodo: String,
        localDate: String
    ): PhraseEntity?

    @Query(
        """
        SELECT EXISTS(
            SELECT 1 FROM phrases
            WHERE localDate = :localDate AND periodo = :periodo
        )
        """
    )
    suspend fun hasPhraseForDate(localDate: String, periodo: String): Boolean

    @Query("SELECT * FROM phrases WHERE localDate = :localDate ORDER BY receivedAt DESC")
    suspend fun getPhrasesForDate(localDate: String): List<PhraseEntity>

    @Query("DELETE FROM phrases WHERE localDate < :minLocalDate")
    suspend fun deleteBeforeLocalDate(minLocalDate: String)

    @Query("UPDATE phrases SET notifiedAt = :notifiedAt WHERE localId = :localId")
    suspend fun markNotified(localId: Long, notifiedAt: Long)
}

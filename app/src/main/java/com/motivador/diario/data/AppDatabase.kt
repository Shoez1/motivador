package com.motivador.diario.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [PhraseEntity::class],
    version = 2,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun phraseDao(): PhraseDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun get(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "motivador.db"
                )
                    .addMigrations(MIGRATION_1_2)
                    .build()
                    .also { INSTANCE = it }
            }
        }

        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS phrases_new (
                        localId INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        remoteId TEXT NOT NULL,
                        texto TEXT NOT NULL,
                        autor TEXT NOT NULL,
                        tipo TEXT NOT NULL,
                        periodo TEXT NOT NULL,
                        receivedAt INTEGER NOT NULL,
                        localDate TEXT NOT NULL,
                        notifiedAt INTEGER
                    )
                    """.trimIndent()
                )

                database.execSQL(
                    """
                    INSERT INTO phrases_new (
                        remoteId,
                        texto,
                        autor,
                        tipo,
                        periodo,
                        receivedAt,
                        localDate,
                        notifiedAt
                    )
                    SELECT
                        id,
                        texto,
                        autor,
                        tipo,
                        periodo,
                        receivedAt,
                        strftime('%Y-%m-%d', receivedAt / 1000, 'unixepoch', '-3 hours'),
                        NULL
                    FROM phrases
                    """.trimIndent()
                )

                database.execSQL("DROP TABLE phrases")
                database.execSQL("ALTER TABLE phrases_new RENAME TO phrases")
                database.execSQL(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS index_phrases_remoteId_periodo_localDate
                    ON phrases(remoteId, periodo, localDate)
                    """.trimIndent()
                )
            }
        }
    }
}

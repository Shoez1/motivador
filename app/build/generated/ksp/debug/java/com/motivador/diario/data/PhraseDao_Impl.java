package com.motivador.diario.data;

import android.database.Cursor;
import android.os.CancellationSignal;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.room.CoroutinesRoom;
import androidx.room.EntityInsertionAdapter;
import androidx.room.RoomDatabase;
import androidx.room.RoomSQLiteQuery;
import androidx.room.SharedSQLiteStatement;
import androidx.room.util.CursorUtil;
import androidx.room.util.DBUtil;
import androidx.sqlite.db.SupportSQLiteStatement;
import java.lang.Boolean;
import java.lang.Class;
import java.lang.Exception;
import java.lang.Long;
import java.lang.Object;
import java.lang.Override;
import java.lang.String;
import java.lang.SuppressWarnings;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Callable;
import javax.annotation.processing.Generated;
import kotlin.Unit;
import kotlin.coroutines.Continuation;

@Generated("androidx.room.RoomProcessor")
@SuppressWarnings({"unchecked", "deprecation"})
public final class PhraseDao_Impl implements PhraseDao {
  private final RoomDatabase __db;

  private final EntityInsertionAdapter<PhraseEntity> __insertionAdapterOfPhraseEntity;

  private final SharedSQLiteStatement __preparedStmtOfDeleteBeforeLocalDate;

  private final SharedSQLiteStatement __preparedStmtOfMarkNotified;

  public PhraseDao_Impl(@NonNull final RoomDatabase __db) {
    this.__db = __db;
    this.__insertionAdapterOfPhraseEntity = new EntityInsertionAdapter<PhraseEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "INSERT OR IGNORE INTO `phrases` (`localId`,`remoteId`,`texto`,`autor`,`tipo`,`periodo`,`receivedAt`,`localDate`,`notifiedAt`) VALUES (nullif(?, 0),?,?,?,?,?,?,?,?)";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final PhraseEntity entity) {
        statement.bindLong(1, entity.getLocalId());
        statement.bindString(2, entity.getRemoteId());
        statement.bindString(3, entity.getTexto());
        statement.bindString(4, entity.getAutor());
        statement.bindString(5, entity.getTipo());
        statement.bindString(6, entity.getPeriodo());
        statement.bindLong(7, entity.getReceivedAt());
        statement.bindString(8, entity.getLocalDate());
        if (entity.getNotifiedAt() == null) {
          statement.bindNull(9);
        } else {
          statement.bindLong(9, entity.getNotifiedAt());
        }
      }
    };
    this.__preparedStmtOfDeleteBeforeLocalDate = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "DELETE FROM phrases WHERE localDate < ?";
        return _query;
      }
    };
    this.__preparedStmtOfMarkNotified = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "UPDATE phrases SET notifiedAt = ? WHERE localId = ?";
        return _query;
      }
    };
  }

  @Override
  public Object insert(final PhraseEntity entity, final Continuation<? super Long> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Long>() {
      @Override
      @NonNull
      public Long call() throws Exception {
        __db.beginTransaction();
        try {
          final Long _result = __insertionAdapterOfPhraseEntity.insertAndReturnId(entity);
          __db.setTransactionSuccessful();
          return _result;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object deleteBeforeLocalDate(final String minLocalDate,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfDeleteBeforeLocalDate.acquire();
        int _argIndex = 1;
        _stmt.bindString(_argIndex, minLocalDate);
        try {
          __db.beginTransaction();
          try {
            _stmt.executeUpdateDelete();
            __db.setTransactionSuccessful();
            return Unit.INSTANCE;
          } finally {
            __db.endTransaction();
          }
        } finally {
          __preparedStmtOfDeleteBeforeLocalDate.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Object markNotified(final long localId, final long notifiedAt,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfMarkNotified.acquire();
        int _argIndex = 1;
        _stmt.bindLong(_argIndex, notifiedAt);
        _argIndex = 2;
        _stmt.bindLong(_argIndex, localId);
        try {
          __db.beginTransaction();
          try {
            _stmt.executeUpdateDelete();
            __db.setTransactionSuccessful();
            return Unit.INSTANCE;
          } finally {
            __db.endTransaction();
          }
        } finally {
          __preparedStmtOfMarkNotified.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Object recent(final int limit,
      final Continuation<? super List<PhraseEntity>> $completion) {
    final String _sql = "SELECT * FROM phrases ORDER BY receivedAt DESC LIMIT ?";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindLong(_argIndex, limit);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<PhraseEntity>>() {
      @Override
      @NonNull
      public List<PhraseEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfLocalId = CursorUtil.getColumnIndexOrThrow(_cursor, "localId");
          final int _cursorIndexOfRemoteId = CursorUtil.getColumnIndexOrThrow(_cursor, "remoteId");
          final int _cursorIndexOfTexto = CursorUtil.getColumnIndexOrThrow(_cursor, "texto");
          final int _cursorIndexOfAutor = CursorUtil.getColumnIndexOrThrow(_cursor, "autor");
          final int _cursorIndexOfTipo = CursorUtil.getColumnIndexOrThrow(_cursor, "tipo");
          final int _cursorIndexOfPeriodo = CursorUtil.getColumnIndexOrThrow(_cursor, "periodo");
          final int _cursorIndexOfReceivedAt = CursorUtil.getColumnIndexOrThrow(_cursor, "receivedAt");
          final int _cursorIndexOfLocalDate = CursorUtil.getColumnIndexOrThrow(_cursor, "localDate");
          final int _cursorIndexOfNotifiedAt = CursorUtil.getColumnIndexOrThrow(_cursor, "notifiedAt");
          final List<PhraseEntity> _result = new ArrayList<PhraseEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final PhraseEntity _item;
            final long _tmpLocalId;
            _tmpLocalId = _cursor.getLong(_cursorIndexOfLocalId);
            final String _tmpRemoteId;
            _tmpRemoteId = _cursor.getString(_cursorIndexOfRemoteId);
            final String _tmpTexto;
            _tmpTexto = _cursor.getString(_cursorIndexOfTexto);
            final String _tmpAutor;
            _tmpAutor = _cursor.getString(_cursorIndexOfAutor);
            final String _tmpTipo;
            _tmpTipo = _cursor.getString(_cursorIndexOfTipo);
            final String _tmpPeriodo;
            _tmpPeriodo = _cursor.getString(_cursorIndexOfPeriodo);
            final long _tmpReceivedAt;
            _tmpReceivedAt = _cursor.getLong(_cursorIndexOfReceivedAt);
            final String _tmpLocalDate;
            _tmpLocalDate = _cursor.getString(_cursorIndexOfLocalDate);
            final Long _tmpNotifiedAt;
            if (_cursor.isNull(_cursorIndexOfNotifiedAt)) {
              _tmpNotifiedAt = null;
            } else {
              _tmpNotifiedAt = _cursor.getLong(_cursorIndexOfNotifiedAt);
            }
            _item = new PhraseEntity(_tmpLocalId,_tmpRemoteId,_tmpTexto,_tmpAutor,_tmpTipo,_tmpPeriodo,_tmpReceivedAt,_tmpLocalDate,_tmpNotifiedAt);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Object last(final Continuation<? super PhraseEntity> $completion) {
    final String _sql = "SELECT * FROM phrases ORDER BY receivedAt DESC LIMIT 1";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 0);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<PhraseEntity>() {
      @Override
      @Nullable
      public PhraseEntity call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfLocalId = CursorUtil.getColumnIndexOrThrow(_cursor, "localId");
          final int _cursorIndexOfRemoteId = CursorUtil.getColumnIndexOrThrow(_cursor, "remoteId");
          final int _cursorIndexOfTexto = CursorUtil.getColumnIndexOrThrow(_cursor, "texto");
          final int _cursorIndexOfAutor = CursorUtil.getColumnIndexOrThrow(_cursor, "autor");
          final int _cursorIndexOfTipo = CursorUtil.getColumnIndexOrThrow(_cursor, "tipo");
          final int _cursorIndexOfPeriodo = CursorUtil.getColumnIndexOrThrow(_cursor, "periodo");
          final int _cursorIndexOfReceivedAt = CursorUtil.getColumnIndexOrThrow(_cursor, "receivedAt");
          final int _cursorIndexOfLocalDate = CursorUtil.getColumnIndexOrThrow(_cursor, "localDate");
          final int _cursorIndexOfNotifiedAt = CursorUtil.getColumnIndexOrThrow(_cursor, "notifiedAt");
          final PhraseEntity _result;
          if (_cursor.moveToFirst()) {
            final long _tmpLocalId;
            _tmpLocalId = _cursor.getLong(_cursorIndexOfLocalId);
            final String _tmpRemoteId;
            _tmpRemoteId = _cursor.getString(_cursorIndexOfRemoteId);
            final String _tmpTexto;
            _tmpTexto = _cursor.getString(_cursorIndexOfTexto);
            final String _tmpAutor;
            _tmpAutor = _cursor.getString(_cursorIndexOfAutor);
            final String _tmpTipo;
            _tmpTipo = _cursor.getString(_cursorIndexOfTipo);
            final String _tmpPeriodo;
            _tmpPeriodo = _cursor.getString(_cursorIndexOfPeriodo);
            final long _tmpReceivedAt;
            _tmpReceivedAt = _cursor.getLong(_cursorIndexOfReceivedAt);
            final String _tmpLocalDate;
            _tmpLocalDate = _cursor.getString(_cursorIndexOfLocalDate);
            final Long _tmpNotifiedAt;
            if (_cursor.isNull(_cursorIndexOfNotifiedAt)) {
              _tmpNotifiedAt = null;
            } else {
              _tmpNotifiedAt = _cursor.getLong(_cursorIndexOfNotifiedAt);
            }
            _result = new PhraseEntity(_tmpLocalId,_tmpRemoteId,_tmpTexto,_tmpAutor,_tmpTipo,_tmpPeriodo,_tmpReceivedAt,_tmpLocalDate,_tmpNotifiedAt);
          } else {
            _result = null;
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Object findByRemotePeriodAndDate(final String remoteId, final String periodo,
      final String localDate, final Continuation<? super PhraseEntity> $completion) {
    final String _sql = "\n"
            + "        SELECT * FROM phrases\n"
            + "        WHERE remoteId = ? AND periodo = ? AND localDate = ?\n"
            + "        LIMIT 1\n"
            + "        ";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 3);
    int _argIndex = 1;
    _statement.bindString(_argIndex, remoteId);
    _argIndex = 2;
    _statement.bindString(_argIndex, periodo);
    _argIndex = 3;
    _statement.bindString(_argIndex, localDate);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<PhraseEntity>() {
      @Override
      @Nullable
      public PhraseEntity call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfLocalId = CursorUtil.getColumnIndexOrThrow(_cursor, "localId");
          final int _cursorIndexOfRemoteId = CursorUtil.getColumnIndexOrThrow(_cursor, "remoteId");
          final int _cursorIndexOfTexto = CursorUtil.getColumnIndexOrThrow(_cursor, "texto");
          final int _cursorIndexOfAutor = CursorUtil.getColumnIndexOrThrow(_cursor, "autor");
          final int _cursorIndexOfTipo = CursorUtil.getColumnIndexOrThrow(_cursor, "tipo");
          final int _cursorIndexOfPeriodo = CursorUtil.getColumnIndexOrThrow(_cursor, "periodo");
          final int _cursorIndexOfReceivedAt = CursorUtil.getColumnIndexOrThrow(_cursor, "receivedAt");
          final int _cursorIndexOfLocalDate = CursorUtil.getColumnIndexOrThrow(_cursor, "localDate");
          final int _cursorIndexOfNotifiedAt = CursorUtil.getColumnIndexOrThrow(_cursor, "notifiedAt");
          final PhraseEntity _result;
          if (_cursor.moveToFirst()) {
            final long _tmpLocalId;
            _tmpLocalId = _cursor.getLong(_cursorIndexOfLocalId);
            final String _tmpRemoteId;
            _tmpRemoteId = _cursor.getString(_cursorIndexOfRemoteId);
            final String _tmpTexto;
            _tmpTexto = _cursor.getString(_cursorIndexOfTexto);
            final String _tmpAutor;
            _tmpAutor = _cursor.getString(_cursorIndexOfAutor);
            final String _tmpTipo;
            _tmpTipo = _cursor.getString(_cursorIndexOfTipo);
            final String _tmpPeriodo;
            _tmpPeriodo = _cursor.getString(_cursorIndexOfPeriodo);
            final long _tmpReceivedAt;
            _tmpReceivedAt = _cursor.getLong(_cursorIndexOfReceivedAt);
            final String _tmpLocalDate;
            _tmpLocalDate = _cursor.getString(_cursorIndexOfLocalDate);
            final Long _tmpNotifiedAt;
            if (_cursor.isNull(_cursorIndexOfNotifiedAt)) {
              _tmpNotifiedAt = null;
            } else {
              _tmpNotifiedAt = _cursor.getLong(_cursorIndexOfNotifiedAt);
            }
            _result = new PhraseEntity(_tmpLocalId,_tmpRemoteId,_tmpTexto,_tmpAutor,_tmpTipo,_tmpPeriodo,_tmpReceivedAt,_tmpLocalDate,_tmpNotifiedAt);
          } else {
            _result = null;
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Object hasPhraseForDate(final String localDate, final String periodo,
      final Continuation<? super Boolean> $completion) {
    final String _sql = "\n"
            + "        SELECT EXISTS(\n"
            + "            SELECT 1 FROM phrases\n"
            + "            WHERE localDate = ? AND periodo = ?\n"
            + "        )\n"
            + "        ";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 2);
    int _argIndex = 1;
    _statement.bindString(_argIndex, localDate);
    _argIndex = 2;
    _statement.bindString(_argIndex, periodo);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<Boolean>() {
      @Override
      @NonNull
      public Boolean call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final Boolean _result;
          if (_cursor.moveToFirst()) {
            final int _tmp;
            _tmp = _cursor.getInt(0);
            _result = _tmp != 0;
          } else {
            _result = false;
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Object getPhrasesForDate(final String localDate,
      final Continuation<? super List<PhraseEntity>> $completion) {
    final String _sql = "SELECT * FROM phrases WHERE localDate = ? ORDER BY receivedAt DESC";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindString(_argIndex, localDate);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<PhraseEntity>>() {
      @Override
      @NonNull
      public List<PhraseEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfLocalId = CursorUtil.getColumnIndexOrThrow(_cursor, "localId");
          final int _cursorIndexOfRemoteId = CursorUtil.getColumnIndexOrThrow(_cursor, "remoteId");
          final int _cursorIndexOfTexto = CursorUtil.getColumnIndexOrThrow(_cursor, "texto");
          final int _cursorIndexOfAutor = CursorUtil.getColumnIndexOrThrow(_cursor, "autor");
          final int _cursorIndexOfTipo = CursorUtil.getColumnIndexOrThrow(_cursor, "tipo");
          final int _cursorIndexOfPeriodo = CursorUtil.getColumnIndexOrThrow(_cursor, "periodo");
          final int _cursorIndexOfReceivedAt = CursorUtil.getColumnIndexOrThrow(_cursor, "receivedAt");
          final int _cursorIndexOfLocalDate = CursorUtil.getColumnIndexOrThrow(_cursor, "localDate");
          final int _cursorIndexOfNotifiedAt = CursorUtil.getColumnIndexOrThrow(_cursor, "notifiedAt");
          final List<PhraseEntity> _result = new ArrayList<PhraseEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final PhraseEntity _item;
            final long _tmpLocalId;
            _tmpLocalId = _cursor.getLong(_cursorIndexOfLocalId);
            final String _tmpRemoteId;
            _tmpRemoteId = _cursor.getString(_cursorIndexOfRemoteId);
            final String _tmpTexto;
            _tmpTexto = _cursor.getString(_cursorIndexOfTexto);
            final String _tmpAutor;
            _tmpAutor = _cursor.getString(_cursorIndexOfAutor);
            final String _tmpTipo;
            _tmpTipo = _cursor.getString(_cursorIndexOfTipo);
            final String _tmpPeriodo;
            _tmpPeriodo = _cursor.getString(_cursorIndexOfPeriodo);
            final long _tmpReceivedAt;
            _tmpReceivedAt = _cursor.getLong(_cursorIndexOfReceivedAt);
            final String _tmpLocalDate;
            _tmpLocalDate = _cursor.getString(_cursorIndexOfLocalDate);
            final Long _tmpNotifiedAt;
            if (_cursor.isNull(_cursorIndexOfNotifiedAt)) {
              _tmpNotifiedAt = null;
            } else {
              _tmpNotifiedAt = _cursor.getLong(_cursorIndexOfNotifiedAt);
            }
            _item = new PhraseEntity(_tmpLocalId,_tmpRemoteId,_tmpTexto,_tmpAutor,_tmpTipo,_tmpPeriodo,_tmpReceivedAt,_tmpLocalDate,_tmpNotifiedAt);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @NonNull
  public static List<Class<?>> getRequiredConverters() {
    return Collections.emptyList();
  }
}

import 'dotenv/config';

import express from 'express';
import { randomUUID } from 'crypto';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

const PORT = Number(process.env.PORT ?? 8080);
const API_KEY = process.env.API_KEY ?? 'motv_7V1c9YpQmD3nK8sL2tX4aB6eR0uI5oZJ';
const SQLITE_PATH = process.env.SQLITE_PATH ?? './data/motivador.sqlite';

const app = express();
app.use(express.json());

function requireApiKey(req, res, next) {
  const apiKey = req.header('x-api-key');
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

function requireDeviceId(req, res, next) {
  const deviceId = req.header('x-device-id');
  if (!deviceId || String(deviceId).trim().length < 6) {
    return res.status(400).json({ error: 'missing_device_id' });
  }
  req.deviceId = String(deviceId);
  next();
}

function normalizePeriodo(periodo) {
  if (periodo === 'manha' || periodo === 'tarde') return periodo;
  return null;
}

function generateAiPhrase(periodo) {
  const morningThemes = [
    'clareza',
    'disciplina',
    'foco',
    'coragem',
    'consistência',
    'responsabilidade'
  ];
  const eveningThemes = [
    'gratidão',
    'aprendizado',
    'paz',
    'resiliência',
    'humildade',
    'progresso'
  ];

  const theme = (periodo === 'manha' ? morningThemes : eveningThemes)[
    Math.floor(Math.random() * 6)
  ];

  const templatesMorning = [
    'Hoje, escolha %THEME% antes do conforto. O seu futuro agradece.',
    'Comece com %THEME%. Pequenas decisões constroem grandes destinos.',
    'O dia não exige perfeição, exige %THEME%.'
  ];

  const templatesEvening = [
    'Feche o dia com %THEME%: reconheça o avanço, ajuste a rota e siga.',
    'A vitória de hoje é %THEME% sobre o que te desviava.',
    'Descanse com %THEME%. Amanhã é uma nova chance de evoluir.'
  ];

  const templates = periodo === 'manha' ? templatesMorning : templatesEvening;
  const chosen = templates[Math.floor(Math.random() * templates.length)];

  return chosen.replace('%THEME%', theme);
}

async function initDb() {
  const db = await open({ filename: SQLITE_PATH, driver: sqlite3.Database });

  await db.exec(`
    PRAGMA journal_mode=WAL;

    CREATE TABLE IF NOT EXISTS phrases (
      id TEXT PRIMARY KEY,
      texto TEXT NOT NULL,
      autor TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('historica','ia')),
      periodo TEXT NOT NULL CHECK(periodo IN ('manha','tarde')),
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sent (
      device_id TEXT NOT NULL,
      phrase_id TEXT NOT NULL,
      periodo TEXT NOT NULL CHECK(periodo IN ('manha','tarde')),
      sent_at INTEGER NOT NULL,
      PRIMARY KEY(device_id, phrase_id),
      FOREIGN KEY(phrase_id) REFERENCES phrases(id)
    );

    CREATE INDEX IF NOT EXISTS idx_sent_device_periodo ON sent(device_id, periodo);
    CREATE INDEX IF NOT EXISTS idx_phrases_periodo ON phrases(periodo);
  `);

  const countRow = await db.get('SELECT COUNT(1) as c FROM phrases');
  if ((countRow?.c ?? 0) === 0) {
    const now = Date.now();
    const seed = getSeedPhrases();
    const insert = await db.prepare(
      'INSERT INTO phrases (id, texto, autor, tipo, periodo, created_at) VALUES (?,?,?,?,?,?)'
    );

    try {
      for (const p of seed) {
        await insert.run(p.id, p.texto, p.autor, p.tipo, p.periodo, now);
      }
    } finally {
      await insert.finalize();
    }
  }

  return db;
}

function getSeedPhrases() {
  return [
    {
      id: randomUUID(),
      texto: 'A felicidade da sua vida depende da qualidade dos seus pensamentos.',
      autor: 'Marco Aurélio',
      tipo: 'historica',
      periodo: 'manha'
    },
    {
      id: randomUUID(),
      texto: 'Não é porque as coisas são difíceis que não ousamos; é porque não ousamos que elas são difíceis.',
      autor: 'Sêneca',
      tipo: 'historica',
      periodo: 'manha'
    },
    {
      id: randomUUID(),
      texto: 'A simplicidade é o último grau de sofisticação.',
      autor: 'Leonardo da Vinci',
      tipo: 'historica',
      periodo: 'manha'
    },
    {
      id: randomUUID(),
      texto: 'Seu tempo é limitado, então não o desperdice vivendo a vida de outra pessoa.',
      autor: 'Steve Jobs',
      tipo: 'historica',
      periodo: 'manha'
    },
    {
      id: randomUUID(),
      texto: 'As pessoas costumam dizer que a motivação não dura. Bem, nem o banho — por isso recomendamos diariamente.',
      autor: 'Zig Ziglar',
      tipo: 'historica',
      periodo: 'manha'
    },

    {
      id: randomUUID(),
      texto: 'O que você faz hoje pode melhorar todos os seus amanhãs.',
      autor: 'Ralph Marston',
      tipo: 'historica',
      periodo: 'tarde'
    },
    {
      id: randomUUID(),
      texto: 'A melhor maneira de prever o futuro é criá-lo.',
      autor: 'Peter Drucker',
      tipo: 'historica',
      periodo: 'tarde'
    },
    {
      id: randomUUID(),
      texto: 'Aquele que tem um porquê para viver pode suportar quase qualquer como.',
      autor: 'Friedrich Nietzsche',
      tipo: 'historica',
      periodo: 'tarde'
    },
    {
      id: randomUUID(),
      texto: 'O sucesso é a soma de pequenos esforços repetidos dia após dia.',
      autor: 'Robert Collier',
      tipo: 'historica',
      periodo: 'tarde'
    },
    {
      id: randomUUID(),
      texto: 'Se você pensa que pode ou que não pode, de qualquer forma você está certo.',
      autor: 'Henry Ford',
      tipo: 'historica',
      periodo: 'tarde'
    }
  ];
}

const db = await initDb();

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/api/frase', requireApiKey, requireDeviceId, async (req, res) => {
  const periodo = normalizePeriodo(String(req.query.periodo ?? ''));
  if (!periodo) {
    return res.status(400).json({ error: 'invalid_periodo' });
  }

  const deviceId = req.deviceId;

  const phrase = await db.get(
    `
    SELECT p.id, p.texto, p.autor, p.tipo
    FROM phrases p
    WHERE p.periodo = ?
      AND NOT EXISTS (
        SELECT 1 FROM sent s
        WHERE s.device_id = ? AND s.phrase_id = p.id
      )
    ORDER BY p.created_at ASC
    LIMIT 1
    `,
    [periodo, deviceId]
  );

  let selected = phrase;

  if (!selected) {
    const id = randomUUID();
    const texto = generateAiPhrase(periodo);
    const autor = 'IA';
    const tipo = 'ia';
    const createdAt = Date.now();

    await db.run(
      'INSERT INTO phrases (id, texto, autor, tipo, periodo, created_at) VALUES (?,?,?,?,?,?)',
      [id, texto, autor, tipo, periodo, createdAt]
    );

    selected = { id, texto, autor, tipo };
  }

  await db.run(
    'INSERT OR IGNORE INTO sent (device_id, phrase_id, periodo, sent_at) VALUES (?,?,?,?)',
    [deviceId, selected.id, periodo, Date.now()]
  );

  res.json(selected);
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`motivador-server listening on http://localhost:${PORT}`);
});

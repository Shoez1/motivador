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

// Agendador de frases diárias (horário de Brasília)
function scheduleDailyPhrases() {
  console.log('🕐 Agendando geração de frases diárias (horário de Brasília)...');
  
  // Gera frase da manhã às 5h
  schedulePhraseGeneration('manha', 5, 0);
  
  // Gera frase da tarde às 18h
  schedulePhraseGeneration('tarde', 18, 0);
}

function schedulePhraseGeneration(periodo, hour, minute) {
  const now = new Date();
  const brasiliaTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
  
  // Próxima execução
  const next = new Date(brasiliaTime);
  next.setHours(hour, minute, 0, 0);
  
  // Se já passou hoje, agenda para amanhã
  if (next <= brasiliaTime) {
    next.setDate(next.getDate() + 1);
  }
  
  const delayMs = next - brasiliaTime;
  
  console.log(`📅 Próxima frase ${periodo} agendada para: ${next.toLocaleString('pt-BR', {timeZone: 'America/Sao_Paulo'})}`);
  
  setTimeout(() => {
    generateDailyPhrase(periodo);
    // Agenda recursivamente para o próximo dia
    schedulePhraseGeneration(periodo, hour, minute);
  }, delayMs);
}

async function generateDailyPhrase(periodo) {
  try {
    console.log(`🎯 Gerando frase diária ${periodo}...`);
    
    const db = await initDb();
    const availablePhrases = await db.all(
      `SELECT p.id, p.texto, p.autor, p.tipo 
       FROM phrases p 
       WHERE p.periodo = ? 
         AND NOT EXISTS (
           SELECT 1 FROM daily_phrases dp 
           WHERE dp.phrase_id = p.id 
             AND dp.date = DATE('now','-3 hours')
         )`,
      [periodo]
    );
    
    if (availablePhrases.length === 0) {
      console.log(`⚠️ Nenhuma frase disponível para ${periodo} hoje`);
      return;
    }
    
    const selected = availablePhrases[Math.floor(Math.random() * availablePhrases.length)];
    
    // Salva como frase do dia
    await db.run(
      `INSERT OR REPLACE INTO daily_phrases (date, periodo, phrase_id, texto, autor, tipo, created_at) 
       VALUES (DATE('now','-3 hours'), ?, ?, ?, ?, ?, ?)`,
      [periodo, selected.id, selected.texto, selected.autor, selected.tipo, Date.now()]
    );
    
    console.log(`✅ Frase ${periodo} do dia gerada: "${selected.texto.substring(0, 50)}..."`);
    
  } catch (error) {
    console.error(`❌ Erro ao gerar frase ${periodo}:`, error);
  }
}

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

    CREATE TABLE IF NOT EXISTS daily_phrases (
      date TEXT NOT NULL,
      periodo TEXT NOT NULL CHECK(periodo IN ('manha','tarde')),
      phrase_id TEXT NOT NULL,
      texto TEXT NOT NULL,
      autor TEXT NOT NULL,
      tipo TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(date, periodo),
      FOREIGN KEY(phrase_id) REFERENCES phrases(id)
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
    CREATE INDEX IF NOT EXISTS idx_daily_phrases_date ON daily_phrases(date);
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

// Rota raiz para evitar "Cannot GET /"
app.get('/', (req, res) => {
  res.json({
    message: 'Motivador Diário API',
    version: 'v1.2',
    updated: '30/01/26',
    endpoints: {
      health: '/health',
      frase: '/api/frase?periodo=manha|tarde',
      teste: '/api/teste'
    },
    status: 'online'
  });
});

app.get('/api/teste', requireApiKey, requireDeviceId, async (req, res) => {
  const now = new Date();
  const brasilia = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  res.json({
    ok: true,
    message: 'teste ok',
    datetime_brt: brasilia.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    date_brt: brasilia.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    time_brt: brasilia.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  });
});

app.get('/api/frase', requireApiKey, requireDeviceId, async (req, res) => {
  const periodo = normalizePeriodo(String(req.query.periodo ?? ''));
  if (!periodo) {
    return res.status(400).json({ error: 'invalid_periodo' });
  }

  const deviceId = req.deviceId;

  // Busca SOMENTE a frase do dia já gerada pelo servidor (não gera por requisição)
  const selected = await db.get(
    `SELECT dp.phrase_id as id, dp.texto, dp.autor, dp.tipo, dp.periodo
     FROM daily_phrases dp 
     WHERE dp.date = DATE('now','-3 hours') AND dp.periodo = ?`,
    [periodo]
  );

  if (!selected) {
    return res.status(404).json({ error: 'daily_phrase_not_ready', periodo });
  }

  // Registra que este dispositivo recebeu esta frase
  await db.run(
    'INSERT OR IGNORE INTO sent (device_id, phrase_id, periodo, sent_at) VALUES (?,?,?,?)',
    [deviceId, selected.id, periodo, Date.now()]
  );

  res.json(selected);
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`motivador-server listening on http://localhost:${PORT}`);
  
  // Inicia o agendador de frases diárias
  scheduleDailyPhrases();
});

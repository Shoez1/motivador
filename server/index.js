require('dotenv/config');

const fs = require('fs');
const path = require('path');
const express = require('express');
const { createHash } = require('crypto');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');

const PORT = Number(process.env.PORT ?? 8080);
const API_KEY = process.env.API_KEY ?? 'motv_7V1c9YpQmD3nK8sL2tX4aB6eR0uI5oZJ';
const SQLITE_PATH = process.env.SQLITE_PATH ?? './data/motivador.sqlite';
const RESEARCH_TIMEOUT_MS = Number(process.env.RESEARCH_TIMEOUT_MS ?? 12000);
const PENSADOR_BASE_URL = trimTrailingSlash(
  process.env.PENSADOR_BASE_URL ?? 'https://www.pensador.com'
);
const PENSADOR_CACHE_TTL_MS = Number(process.env.PENSADOR_CACHE_TTL_MS ?? 6 * 60 * 60 * 1000);
const PENSADOR_PAGE_LIMIT = Number(process.env.PENSADOR_PAGE_LIMIT ?? 12);
const USER_AGENT =
  process.env.RESEARCH_USER_AGENT ??
  'Mozilla/5.0 (compatible; MotivadorDiario/1.7; +https://motivador.sysdev2.serv00.net)';

const PENSADOR_DEFAULT_PATHS = {
  manha: [
    'frases_motivacionais',
    'frases_de_motivacao',
    'frases_de_bom_dia',
    'mensagens_de_bom_dia',
    'frases_de_reflexao'
  ],
  tarde: [
    'frases_de_reflexao',
    'frases_motivacionais',
    'frases_de_gratidao',
    'frases_de_paz',
    'frases_de_boa_noite',
    'mensagens_de_boa_noite'
  ]
};

const HTML_ENTITY_MAP = {
  amp: '&',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  lt: '<',
  gt: '>',
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  ndash: '-',
  mdash: '-',
  hellip: '...',
  aacute: '\u00e1',
  Aacute: '\u00c1',
  acirc: '\u00e2',
  Acirc: '\u00c2',
  agrave: '\u00e0',
  Agrave: '\u00c0',
  atilde: '\u00e3',
  Atilde: '\u00c3',
  ccedil: '\u00e7',
  Ccedil: '\u00c7',
  eacute: '\u00e9',
  Eacute: '\u00c9',
  ecirc: '\u00ea',
  Ecirc: '\u00ca',
  iacute: '\u00ed',
  Iacute: '\u00cd',
  oacute: '\u00f3',
  Oacute: '\u00d3',
  ocirc: '\u00f4',
  Ocirc: '\u00d4',
  otilde: '\u00f5',
  Otilde: '\u00d5',
  uacute: '\u00fa',
  Uacute: '\u00da',
  uuml: '\u00fc',
  Uuml: '\u00dc'
};

const app = express();
let db;
const quotePoolRefreshes = new Map();

app.use(express.json());

function scheduleDailyPhrases() {
  console.log('Scheduling Pensador quote refresh (America/Sao_Paulo)...');
  schedulePhraseGeneration('manha', 5, 0);
  schedulePhraseGeneration('tarde', 18, 0);
}

function schedulePhraseGeneration(periodo, hour, minute) {
  const now = new Date();
  const brasiliaTime = new Date(
    now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  );

  const next = new Date(brasiliaTime);
  next.setHours(hour, minute, 0, 0);

  if (next <= brasiliaTime) {
    next.setDate(next.getDate() + 1);
  }

  const delayMs = next - brasiliaTime;

  console.log(
    `Next ${periodo} quote refresh scheduled for ${next.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo'
    })}`
  );

  setTimeout(() => {
    generateDailyPhrase(periodo);
    schedulePhraseGeneration(periodo, hour, minute);
  }, delayMs);
}

async function ensureTodayPhrasesReady() {
  const hour = currentBrasiliaHour();

  try {
    const localDb = await getDb();

    if (hour >= 5) {
      await ensureGlobalPhrase(localDb, 'manha');
    }

    if (hour >= 18) {
      await ensureGlobalPhrase(localDb, 'tarde');
    }
  } catch (error) {
    console.error('Error ensuring daily Pensador quotes on startup:', error);
  }
}

async function generateDailyPhrase(periodo) {
  try {
    const localDb = await getDb();
    const phrase = await ensureGlobalPhrase(localDb, periodo);

    if (phrase) {
      console.log(`Daily Pensador quote for ${periodo}: "${phrase.texto.substring(0, 50)}..."`);
    }
  } catch (error) {
    console.error(`Error caching ${periodo} Pensador quote:`, error);
  }
}

async function ensureGlobalPhrase(localDb, periodo) {
  const existing = await localDb.get(
    `SELECT dp.phrase_id as id, dp.texto, dp.autor, dp.tipo, dp.periodo
     FROM daily_phrases dp
     JOIN phrases p ON p.id = dp.phrase_id
     WHERE dp.date = DATE('now','-3 hours') AND dp.periodo = ?
       AND p.id LIKE 'quote-%'
     LIMIT 1`,
    [periodo]
  );

  if (existing) {
    return existing;
  }

  const phrase = await createUniqueRealQuotePhrase(localDb, `global-${periodo}`, periodo);
  await localDb.run(
    `INSERT OR REPLACE INTO daily_phrases (date, periodo, phrase_id, texto, autor, tipo, created_at)
     VALUES (DATE('now','-3 hours'), ?, ?, ?, ?, ?, ?)`,
    [periodo, phrase.id, phrase.texto, phrase.autor, phrase.tipo, Date.now()]
  );
  return phrase;
}

async function getDb() {
  if (!db) {
    db = await initDb();
  }
  return db;
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
  if (periodo === 'manha' || periodo === 'tarde') {
    return periodo;
  }
  return null;
}

function currentBrasiliaDateInfo(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    hour12: false
  })
    .formatToParts(now)
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: Number(parts.hour),
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    brDate: `${parts.day}/${parts.month}/${parts.year}`,
    dayMonthLabel: `${Number(parts.day)} de ${monthNamePt(parts.month)}`
  };
}

function currentBrasiliaHour() {
  return currentBrasiliaDateInfo().hour;
}

function isPeriodReleased(periodo) {
  const hour = currentBrasiliaHour();
  return periodo === 'manha' ? hour >= 5 : hour >= 18;
}

async function getDeviceDailyPhrase(localDb, deviceId, periodo) {
  return localDb.get(
    `SELECT p.id, p.texto, p.autor, p.tipo, ddp.periodo
     FROM device_daily_phrases ddp
     JOIN phrases p ON p.id = ddp.phrase_id
     WHERE ddp.device_id = ?
       AND ddp.date = DATE('now','-3 hours')
       AND ddp.periodo = ?
       AND p.id LIKE 'quote-%'
     LIMIT 1`,
    [deviceId, periodo]
  );
}

async function assignDeviceDailyPhrase(localDb, deviceId, periodo) {
  const existing = await getDeviceDailyPhrase(localDb, deviceId, periodo);
  if (existing) {
    return existing;
  }

  const phrase = await createUniqueRealQuotePhrase(localDb, deviceId, periodo);
  const assignedAt = Date.now();

  await localDb.run(
    `INSERT OR REPLACE INTO device_daily_phrases (device_id, date, periodo, phrase_id, created_at)
     VALUES (?, DATE('now','-3 hours'), ?, ?, ?)`,
    [deviceId, periodo, phrase.id, assignedAt]
  );
  await markPhraseSent(localDb, deviceId, phrase.id, periodo, assignedAt);
  await rememberDeviceText(localDb, deviceId, phrase.texto, assignedAt);

  return phrase;
}

async function markPhraseSent(localDb, deviceId, phraseId, periodo, sentAt) {
  await localDb.run(
    'INSERT OR IGNORE INTO sent (device_id, phrase_id, periodo, sent_at) VALUES (?,?,?,?)',
    [deviceId, phraseId, periodo, sentAt]
  );
  await localDb.run(
    'UPDATE sent SET periodo = ?, sent_at = ? WHERE device_id = ? AND phrase_id = ?',
    [periodo, sentAt, deviceId, phraseId]
  );
}

async function createUniqueRealQuotePhrase(localDb, deviceId, periodo) {
  const dateInfo = currentBrasiliaDateInfo();
  const quotes = await getQuotePool(localDb, periodo, dateInfo);
  const orderedQuotes = orderQuotesForDevice(quotes, deviceId, periodo, dateInfo);

  for (const quote of orderedQuotes) {
    const phrase = quoteToPhrase(quote, deviceId, periodo, dateInfo);

    if (!(await hasDeviceSeenText(localDb, deviceId, phrase.texto))) {
      await storePhrase(localDb, phrase);
      return phrase;
    }
  }

  throw new Error(`No unique Pensador quote available for ${deviceId}/${periodo}`);
}

function quoteToPhrase(quote, deviceId, periodo, dateInfo) {
  const text = clampSentence(quote.text);
  const author = cleanAuthorName(quote.author);
  const idHash = hash(`${deviceId}|${periodo}|${author}|${text}`).slice(0, 18);

  return {
    id: `quote-${dateInfo.dateKey}-${periodo}-${idHash}`,
    texto: text,
    autor: author,
    tipo: 'historica',
    periodo
  };
}

function orderQuotesForDevice(quotes, deviceId, periodo, dateInfo) {
  const seed = hash(`${deviceId}|${periodo}|${dateInfo.dateKey}`);
  return [...quotes].sort((a, b) => {
    const aScore = hash(`${seed}|${a.author}|${a.text}`);
    const bScore = hash(`${seed}|${b.author}|${b.text}`);
    return aScore.localeCompare(bScore);
  });
}

async function getQuotePool(localDb, periodo, dateInfo) {
  const cacheKey = `pensador:${periodo}`;
  const now = Date.now();
  const cached = await localDb.get(
    'SELECT payload, created_at FROM quote_cache WHERE cache_key = ? LIMIT 1',
    [cacheKey]
  );
  const cachedQuotes = parseCachedQuotes(cached?.payload);

  if (cachedQuotes.length > 0 && now - Number(cached.created_at) < PENSADOR_CACHE_TTL_MS) {
    return cachedQuotes;
  }

  let refresh = quotePoolRefreshes.get(cacheKey);
  if (!refresh) {
    refresh = buildPensadorQuotePool(periodo)
      .then(async (freshQuotes) => {
        await localDb.run(
          `INSERT OR REPLACE INTO quote_cache (cache_key, payload, created_at)
           VALUES (?, ?, ?)`,
          [cacheKey, JSON.stringify({ dateKey: dateInfo.dateKey, quotes: freshQuotes }), now]
        );
        return freshQuotes;
      })
      .finally(() => {
        quotePoolRefreshes.delete(cacheKey);
      });
    quotePoolRefreshes.set(cacheKey, refresh);
  }

  try {
    const freshQuotes = await refresh;
    return freshQuotes;
  } catch (error) {
    if (cachedQuotes.length > 0) {
      console.warn(`Using stale Pensador cache for ${periodo}:`, error.message);
      return cachedQuotes;
    }
    throw error;
  }
}

function parseCachedQuotes(payload) {
  if (!payload) {
    return [];
  }

  try {
    const parsed = JSON.parse(payload);
    const quotes = Array.isArray(parsed) ? parsed : parsed.quotes;
    return Array.isArray(quotes) ? quotes.filter(isValidQuoteRecord) : [];
  } catch (_) {
    return [];
  }
}

async function buildPensadorQuotePool(periodo) {
  const urls = buildPensadorUrls(periodo);
  const responses = await Promise.allSettled(urls.map((url) => fetchPensadorPage(url)));
  const quotes = [];

  responses.forEach((response, index) => {
    const url = urls[index];
    if (response.status !== 'fulfilled') {
      console.warn(`Pensador fetch failed for ${url}:`, response.reason?.message ?? response.reason);
      return;
    }
    quotes.push(...extractPensadorQuotes(response.value, url));
  });

  const unique = uniqueQuotes(quotes);
  if (unique.length === 0) {
    throw new Error('Pensador returned no valid quote cards');
  }

  return unique;
}

function buildPensadorUrls(periodo) {
  const paths = configuredPensadorPaths(periodo);
  const urls = [];

  for (const sourcePath of paths) {
    for (let page = 1; page <= 2; page += 1) {
      urls.push(toPensadorUrl(sourcePath, page));
      if (urls.length >= PENSADOR_PAGE_LIMIT) {
        return [...new Set(urls)];
      }
    }
  }

  return [...new Set(urls)];
}

function configuredPensadorPaths(periodo) {
  const envName = periodo === 'manha' ? 'PENSADOR_PATHS_MANHA' : 'PENSADOR_PATHS_TARDE';
  const rawPaths = process.env[envName];
  if (!rawPaths) {
    return PENSADOR_DEFAULT_PATHS[periodo];
  }

  const paths = rawPaths
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return paths.length > 0 ? paths : PENSADOR_DEFAULT_PATHS[periodo];
}

function toPensadorUrl(sourcePath, page) {
  const cleanPath = String(sourcePath).trim();
  const baseUrl = cleanPath.startsWith('http://') || cleanPath.startsWith('https://')
    ? trimTrailingSlash(cleanPath)
    : `${PENSADOR_BASE_URL}/${cleanPath.replace(/^\/+|\/+$/g, '')}`;

  return page === 1 ? `${baseUrl}/` : `${baseUrl}/${page}/`;
}

async function fetchPensadorPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESEARCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.6',
        'user-agent': USER_AGENT
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function extractPensadorQuotes(html, sourceUrl) {
  const quotes = [];
  const quoteRegex = /<p\b[^>]*class=["'][^"']*\bfrase\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi;
  let match;

  while ((match = quoteRegex.exec(html)) !== null) {
    const text = normalizeQuoteText(match[1]);
    const author = extractPensadorAuthor(html.slice(match.index, match.index + 3500));

    if (isValidQuote(text, author)) {
      quotes.push({ text, author: cleanAuthorName(author), sourceUrl });
    }
  }

  return quotes;
}

function extractPensadorAuthor(cardHtml) {
  const authorMatch =
    cardHtml.match(/<span\b[^>]*class=["'][^"']*\bauthor-name\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) ||
    cardHtml.match(/<a\b[^>]*class=["'][^"']*\bauthor-name\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i) ||
    cardHtml.match(/<div\b[^>]*class=["'][^"']*\bautor\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);

  return cleanAuthorName(authorMatch?.[1] ?? '');
}

function normalizeQuoteText(value) {
  return cleanHtmlText(value)
    .replace(/^["']+|["']+$/g, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function cleanAuthorName(value) {
  const author = cleanHtmlText(value)
    .replace(/^autor(?:a)?:\s*/i, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return clampWords(author, 10);
}

function cleanHtmlText(value) {
  return decodeHtmlEntities(stripHtml(String(value).replace(/<br\s*\/?>/gi, ' ')))
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidQuote(text, author) {
  const cleanText = normalizeQuoteText(text);
  const cleanAuthor = cleanAuthorName(author);
  const normalizedText = normalizeText(cleanText);
  const normalizedAuthor = normalizeText(cleanAuthor);

  if (!cleanText || cleanText.length < 25 || cleanText.length > 280) {
    return false;
  }
  if (!cleanAuthor || cleanAuthor.length < 2 || cleanAuthor.length > 80) {
    return false;
  }
  if (
    normalizedText.includes('compartilhar') ||
    normalizedText.includes('copiar') ||
    normalizedText.includes('ver imagem')
  ) {
    return false;
  }
  if (
    normalizedAuthor === 'pensador' ||
    normalizedAuthor === 'autor desconhecido' ||
    normalizedAuthor === 'desconhecido' ||
    normalizedAuthor === 'anonimo' ||
    normalizedAuthor.includes('equipe editorial')
  ) {
    return false;
  }

  return true;
}

function isValidQuoteRecord(quote) {
  return Boolean(quote && isValidQuote(quote.text, quote.author));
}

function uniqueQuotes(quotes) {
  const seen = new Set();
  const result = [];

  for (const quote of quotes) {
    const text = normalizeQuoteText(quote.text);
    const author = cleanAuthorName(quote.author);
    const key = textFingerprint(text);

    if (seen.has(key) || !isValidQuote(text, author)) {
      continue;
    }

    seen.add(key);
    result.push({ text: clampSentence(text), author, sourceUrl: quote.sourceUrl });
  }

  return result;
}

async function storePhrase(localDb, phrase) {
  await localDb.run(
    `INSERT OR IGNORE INTO phrases (id, texto, autor, tipo, periodo, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [phrase.id, phrase.texto, phrase.autor, phrase.tipo, phrase.periodo, Date.now()]
  );
}

async function hasDeviceSeenText(localDb, deviceId, text) {
  const textHash = textFingerprint(text);
  const direct = await localDb.get(
    'SELECT 1 as ok FROM device_text_history WHERE device_id = ? AND text_hash = ? LIMIT 1',
    [deviceId, textHash]
  );

  if (direct) {
    return true;
  }

  const exactLegacy = await localDb.get(
    `SELECT 1 as ok
     FROM sent s
     JOIN phrases p ON p.id = s.phrase_id
     WHERE s.device_id = ? AND p.texto = ?
     LIMIT 1`,
    [deviceId, text]
  );

  return Boolean(exactLegacy);
}

async function rememberDeviceText(localDb, deviceId, text, sentAt) {
  await localDb.run(
    `INSERT OR IGNORE INTO device_text_history (device_id, text_hash, first_sent_at)
     VALUES (?, ?, ?)`,
    [deviceId, textFingerprint(text), sentAt]
  );
}

async function initDb() {
  ensureSqliteDirectory();
  const localDb = await open({ filename: SQLITE_PATH, driver: sqlite3.Database });

  await localDb.exec(`
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

    CREATE TABLE IF NOT EXISTS device_daily_phrases (
      device_id TEXT NOT NULL,
      date TEXT NOT NULL,
      periodo TEXT NOT NULL CHECK(periodo IN ('manha','tarde')),
      phrase_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(device_id, date, periodo),
      FOREIGN KEY(phrase_id) REFERENCES phrases(id)
    );

    CREATE TABLE IF NOT EXISTS device_text_history (
      device_id TEXT NOT NULL,
      text_hash TEXT NOT NULL,
      first_sent_at INTEGER NOT NULL,
      PRIMARY KEY(device_id, text_hash)
    );

    CREATE TABLE IF NOT EXISTS quote_cache (
      cache_key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sent_device_periodo ON sent(device_id, periodo);
    CREATE INDEX IF NOT EXISTS idx_phrases_periodo ON phrases(periodo);
    CREATE INDEX IF NOT EXISTS idx_phrases_text_periodo ON phrases(texto, periodo);
    CREATE INDEX IF NOT EXISTS idx_daily_phrases_date ON daily_phrases(date);
    CREATE INDEX IF NOT EXISTS idx_device_daily_phrases_date ON device_daily_phrases(date, periodo);
    CREATE INDEX IF NOT EXISTS idx_device_text_history_device ON device_text_history(device_id);
    CREATE INDEX IF NOT EXISTS idx_quote_cache_created_at ON quote_cache(created_at);
  `);

  return localDb;
}

function ensureSqliteDirectory() {
  if (SQLITE_PATH === ':memory:') {
    return;
  }

  const directory = path.dirname(path.resolve(SQLITE_PATH));
  fs.mkdirSync(directory, { recursive: true });
}

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/', (req, res) => {
  res.json({
    message: 'Motivador Diario API',
    version: 'v1.7',
    updated: '24/05/26',
    source: 'pensador.com',
    mode: 'frases reais externas, sem IA paga e sem lista fixa local',
    endpoints: {
      health: '/health',
      frase: '/api/frase?periodo=manha|tarde',
      teste: '/api/teste'
    },
    status: 'online'
  });
});

app.get('/api/teste', requireApiKey, requireDeviceId, async (req, res) => {
  const dateInfo = currentBrasiliaDateInfo();
  const periodo =
    normalizePeriodo(String(req.query.periodo ?? '')) ?? (dateInfo.hour >= 18 ? 'tarde' : 'manha');

  try {
    const localDb = await getDb();
    const quotes = await getQuotePool(localDb, periodo, dateInfo);

    res.json({
      ok: true,
      message: 'teste ok',
      datetime_brt: new Date().toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo'
      }),
      date_brt: dateInfo.brDate,
      periodo,
      source: 'pensador.com',
      quote_count: quotes.length,
      sample_author: quotes[0]?.author ?? null
    });
  } catch (error) {
    console.error('Pensador test failed:', error);
    res.status(500).json({ ok: false, error: 'pensador_fetch_failed' });
  }
});

app.get('/api/frase', requireApiKey, requireDeviceId, async (req, res) => {
  const periodo = normalizePeriodo(String(req.query.periodo ?? ''));
  if (!periodo) {
    return res.status(400).json({ error: 'invalid_periodo' });
  }

  if (!isPeriodReleased(periodo)) {
    return res.status(404).json({ error: 'daily_phrase_not_ready', periodo });
  }

  try {
    const localDb = await getDb();
    const selected = await assignDeviceDailyPhrase(localDb, req.deviceId, periodo);
    res.json(selected);
  } catch (error) {
    console.error('Error serving Pensador quote:', error);
    res.status(500).json({ error: 'phrase_generation_failed' });
  }
});

async function start() {
  db = await initDb();

  app.listen(PORT, () => {
    console.log(`motivador-server listening on http://localhost:${PORT}`);
    scheduleDailyPhrases();
    ensureTodayPhrasesReady();
  });
}

function clampSentence(text) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= 240) {
    return ensureFinalPunctuation(clean);
  }

  const limited = clean.slice(0, 237);
  const breakAt = Math.max(limited.lastIndexOf('.'), limited.lastIndexOf(';'), limited.lastIndexOf(','));
  const clipped = breakAt > 140 ? limited.slice(0, breakAt) : limited;
  return ensureFinalPunctuation(clipped.trim());
}

function ensureFinalPunctuation(text) {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function clampWords(text, maxWords) {
  const words = String(text).split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(' ');
}

function stripHtml(text) {
  return String(text)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function decodeHtmlEntities(text) {
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => decodeCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => decodeCodePoint(Number.parseInt(code, 10)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (match, name) => HTML_ENTITY_MAP[name] ?? match);
}

function decodeCodePoint(codePoint) {
  if (!Number.isFinite(codePoint)) {
    return '';
  }

  try {
    return String.fromCodePoint(codePoint);
  } catch (_) {
    return '';
  }
}

function normalizeText(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeTextForHistory(text) {
  return normalizeText(text)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textFingerprint(text) {
  return hash(normalizeTextForHistory(text));
}

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function monthNamePt(month) {
  return [
    'janeiro',
    'fevereiro',
    'marco',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro'
  ][Number(month) - 1];
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

start().catch((error) => {
  console.error('Error starting motivador-server:', error);
  process.exit(1);
});

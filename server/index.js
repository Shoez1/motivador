require('dotenv/config');

const fs = require('fs');
const http = require('http');
const https = require('https');
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
const PENSADOR_MIN_QUOTES = Number(process.env.PENSADOR_MIN_QUOTES ?? 45);
const PENSADOR_MAX_EMPTY_ATTEMPTS = Number(process.env.PENSADOR_MAX_EMPTY_ATTEMPTS ?? 3);
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

class QuoteSourceUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QuoteSourceUnavailableError';
  }
}

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

function requireAppRequest(req, res, next) {
  const apiKey = String(req.header('x-api-key') ?? '').trim();
  const deviceId = String(req.header('x-device-id') ?? '').trim();

  if (apiKey !== API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (deviceId.length < 6 || deviceId.length > 128) {
    return res.status(400).json({ error: 'missing_device_id' });
  }

  req.deviceId = deviceId;
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
    'INSERT OR REPLACE INTO sent (device_id, phrase_id, periodo, sent_at) VALUES (?,?,?,?)',
    [deviceId, phraseId, periodo, sentAt]
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
  const quotes = [];
  let failedOrEmptyAttempts = 0;

  for (const url of urls) {
    try {
      const pageQuotes = extractPensadorQuotes(await fetchPensadorPage(url), url);
      if (pageQuotes.length === 0) {
        failedOrEmptyAttempts += 1;
        console.warn(`Pensador returned no usable quote cards for ${url}`);
      } else {
        quotes.push(...pageQuotes);
      }
    } catch (error) {
      failedOrEmptyAttempts += 1;
      console.warn(`Pensador fetch failed for ${url}:`, error.message);
    }

    const unique = uniqueQuotes(quotes);
    if (unique.length >= PENSADOR_MIN_QUOTES) {
      return unique;
    }

    if (unique.length === 0 && failedOrEmptyAttempts >= PENSADOR_MAX_EMPTY_ATTEMPTS) {
      break;
    }
  }

  const unique = uniqueQuotes(quotes);
  if (unique.length === 0) {
    throw new QuoteSourceUnavailableError('Pensador returned no valid quote cards');
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

function fetchPensadorPage(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === 'https:' ? https : http;
    const request = transport.get(parsedUrl, {
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.6',
        'user-agent': USER_AGENT
      }
    }, (response) => {
      const statusCode = Number(response.statusCode ?? 0);
      const location = response.headers.location;

      if (statusCode >= 300 && statusCode < 400 && location) {
        response.resume();
        if (redirectCount >= 3) {
          reject(new Error('Too many redirects'));
          return;
        }

        const redirectUrl = new URL(location, parsedUrl).toString();
        fetchPensadorPage(redirectUrl, redirectCount + 1).then(resolve, reject);
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`HTTP ${statusCode}`));
        return;
      }

      response.setEncoding('utf8');
      let html = '';
      response.on('data', (chunk) => {
        html += chunk;
      });
      response.on('end', () => resolve(html));
    });

    request.setTimeout(RESEARCH_TIMEOUT_MS, () => {
      request.destroy(new Error(`Request timed out after ${RESEARCH_TIMEOUT_MS} ms`));
    });
    request.on('error', reject);
  });
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
    version: 'v1.8',
    updated: '25/05/26',
    source: 'pensador.com',
    mode: 'frases reais externas, sem IA paga e sem lista fixa local',
    endpoints: {
      health: '/health',
      frase: '/api/frase?periodo=manha|tarde',
      teste: '/api/teste'
    },
    browser_access: 'GET /api/teste pode ser aberto sem headers; /api/frase e exclusivo do aplicativo',
    status: 'online'
  });
});

app.get('/api/teste', async (req, res) => {
  const dateInfo = currentBrasiliaDateInfo();
  const periodo =
    normalizePeriodo(String(req.query.periodo ?? '')) ?? (dateInfo.hour >= 18 ? 'tarde' : 'manha');

  try {
    const localDb = await getDb();
    const quotes = await getQuotePool(localDb, periodo, dateInfo);
    const checkedAt = new Date();

    res.json({
      ok: true,
      message: 'teste ok',
      datetime_brt: checkedAt.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo'
      }),
      date_brt: dateInfo.brDate,
      time_brt: checkedAt.toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo'
      }),
      periodo,
      source: 'pensador.com',
      quote_count: quotes.length,
      sample_author: quotes[0]?.author ?? null
    });
  } catch (error) {
    console.error('Pensador test failed:', error);
    const status = error instanceof QuoteSourceUnavailableError ? 503 : 500;
    res.status(status).json({ ok: false, error: 'pensador_fetch_failed' });
  }
});

app.get('/api/frase', requireAppRequest, async (req, res) => {
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
    const status = error instanceof QuoteSourceUnavailableError ? 503 : 500;
    res.status(status).json({ error: 'phrase_generation_failed' });
  }
});

async function purgeOldServerData(localDb) {
  try {
    const ninetyDaysAgoMs = Date.now() - 90 * 24 * 60 * 60 * 1000;
    await localDb.run('DELETE FROM sent WHERE sent_at < ?', [ninetyDaysAgoMs]);
    await localDb.run('DELETE FROM device_text_history WHERE first_sent_at < ?', [ninetyDaysAgoMs]);
    await localDb.run('DELETE FROM device_daily_phrases WHERE created_at < ?', [ninetyDaysAgoMs]);
    await localDb.run('DELETE FROM daily_phrases WHERE created_at < ?', [ninetyDaysAgoMs]);
    await localDb.run('DELETE FROM phrases WHERE created_at < ?', [ninetyDaysAgoMs]);
    await localDb.run('DELETE FROM quote_cache WHERE created_at < ?', [ninetyDaysAgoMs]);
    console.log('Old server data (> 90 days) purged successfully.');
  } catch (error) {
    console.error('Error purging old server data:', error);
  }
}

async function start() {
  db = await initDb();
  await purgeOldServerData(db);

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

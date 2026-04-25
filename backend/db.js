const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'crm.db');
const DB_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Core tables ───────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS leads (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    phone          TEXT,
    source         TEXT NOT NULL DEFAULT 'Manual',
    message        TEXT,
    agent_id       INTEGER REFERENCES agents(id) ON DELETE SET NULL,
    status         TEXT NOT NULL DEFAULT 'New',
    ai_summary     TEXT,
    notes          TEXT,
    last_contacted TEXT,
    owner_username TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT NOT NULL UNIQUE,
    password     TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'agent',
    display_name TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS properties (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    price       INTEGER NOT NULL,
    city        TEXT,
    area        TEXT,
    type        TEXT,
    rooms       REAL,
    sqm         INTEGER,
    url         TEXT,
    source      TEXT NOT NULL DEFAULT 'API',
    description TEXT,
    ingested_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id        INTEGER REFERENCES leads(id) ON DELETE CASCADE,
    property_id    INTEGER REFERENCES properties(id) ON DELETE CASCADE,
    score          INTEGER NOT NULL DEFAULT 0,
    message        TEXT NOT NULL,
    owner_username TEXT,
    read           INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── Migrations for pre-existing DBs ──────────────────────────────────────────
const leadCols = db.prepare('PRAGMA table_info(leads)').all().map(c => c.name);
if (!leadCols.includes('notes'))          db.exec('ALTER TABLE leads ADD COLUMN notes TEXT');
if (!leadCols.includes('last_contacted')) db.exec('ALTER TABLE leads ADD COLUMN last_contacted TEXT');
if (!leadCols.includes('owner_username')) db.exec('ALTER TABLE leads ADD COLUMN owner_username TEXT');

// ── Seed agents ───────────────────────────────────────────────────────────────
const agentCount = db.prepare('SELECT COUNT(*) as c FROM agents').get().c;
if (agentCount === 0) {
  const ins = db.prepare('INSERT INTO agents (name) VALUES (?)');
  ['דוד לוי', 'שרה כהן', 'משה אברהם', 'רחל גולד'].forEach(n => ins.run(n));
}

// ── Seed leads ────────────────────────────────────────────────────────────────
const leadCount = db.prepare('SELECT COUNT(*) as c FROM leads').get().c;
if (leadCount === 0) {
  const ins = db.prepare(
    'INSERT INTO leads (name, phone, source, message, agent_id, status, owner_username) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  [
    ['אלון בן-דוד',  '050-1234567', 'Yad2',     'מחפש דירת 4 חדרים באזור המרכז, תקציב 2.5M', 1, 'New',               'admin'],
    ['מיכל שפירא',  '052-9876543', 'Facebook', 'מעוניינת בבית פרטי בפרברים, גן גדול חובה',   2, 'Contacted',         'agent1'],
    ['יוסי גרין',   '054-5556666', 'Yad2',     'משקיע המחפש נכס להשקעה באזור תל אביב',      3, 'Meeting Scheduled', 'agent1'],
    ['נועה כץ',     '058-3332211', 'Facebook', 'זוג צעיר רוצה דירה ראשונה, 3 חדרים',        4, 'Closed',            'admin'],
    ['רון פרידמן',  '050-7778899', 'Yad2',     'פנסיונר מחפש דירה קטנה קרוב לים',           1, 'New',               'admin'],
    ['תמר הרצוג',   '052-4445566', 'Facebook', 'צריכה דירה גדולה למשפחה עם 3 ילדים',        2, 'Contacted',         'agent1'],
  ].forEach(r => ins.run(...r));
}

// ── Seed users ────────────────────────────────────────────────────────────────
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
if (userCount === 0) {
  const ins = db.prepare('INSERT INTO users (username, password, role, display_name) VALUES (?, ?, ?, ?)');
  ins.run('admin',  'admin123',  'admin', 'מנהל ראשי');
  ins.run('agent1', 'agent123',  'agent', 'דוד לוי');
}

// ── Seed default settings ─────────────────────────────────────────────────────
const settingsCount = db.prepare('SELECT COUNT(*) as c FROM settings').get().c;
if (settingsCount === 0) {
  const ins = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
  ins.run('system_name',    'AgentIQ');
  ins.run('vat_pct',        '17');
  ins.run('brokerage_pct',  '2');
  ins.run('lawyer_pct',     '0.5');
}

// Auto-generate ingest API key if not set
const apiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'ingest_api_key'").get();
if (!apiKeyRow) {
  const key = 'iq_' + require('crypto').randomBytes(20).toString('hex');
  db.prepare("INSERT INTO settings (key, value) VALUES ('ingest_api_key', ?)").run(key);
}

module.exports = db;

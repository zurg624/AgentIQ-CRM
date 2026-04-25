const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// On Render, use the persistent disk at /data; locally use project root
const DB_PATH = process.env.NODE_ENV === 'production'
  ? '/data/crm.db'
  : path.join(__dirname, 'crm.db');

// Ensure the directory exists before SQLite tries to open the file
const DB_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS leads (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    phone       TEXT,
    source      TEXT NOT NULL DEFAULT 'Manual',
    message     TEXT,
    agent_id    INTEGER REFERENCES agents(id) ON DELETE SET NULL,
    status      TEXT NOT NULL DEFAULT 'New',
    ai_summary  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Seed agents if empty
const agentCount = db.prepare('SELECT COUNT(*) as c FROM agents').get().c;
if (agentCount === 0) {
  const insert = db.prepare('INSERT INTO agents (name) VALUES (?)');
  ['דוד לוי', 'שרה כהן', 'משה אברהם', 'רחל גולד'].forEach(n => insert.run(n));
}

// Seed leads if empty
const leadCount = db.prepare('SELECT COUNT(*) as c FROM leads').get().c;
if (leadCount === 0) {
  const insert = db.prepare(
    'INSERT INTO leads (name, phone, source, message, agent_id, status) VALUES (?, ?, ?, ?, ?, ?)'
  );
  [
    ['אלון בן-דוד',  '050-1234567', 'Yad2',     'מחפש דירת 4 חדרים באזור המרכז, תקציב 2.5M', 1, 'New'],
    ['מיכל שפירא',  '052-9876543', 'Facebook', 'מעוניינת בבית פרטי בפרברים, גן גדול חובה',   2, 'Contacted'],
    ['יוסי גרין',   '054-5556666', 'Yad2',     'משקיע המחפש נכס להשקעה באזור תל אביב',      3, 'Meeting Scheduled'],
    ['נועה כץ',     '058-3332211', 'Facebook', 'זוג צעיר רוצה דירה ראשונה, 3 חדרים',        4, 'Closed'],
    ['רון פרידמן',  '050-7778899', 'Yad2',     'פנסיונר מחפש דירה קטנה קרוב לים',           1, 'New'],
    ['תמר הרצוג',   '052-4445566', 'Facebook', 'צריכה דירה גדולה למשפחה עם 3 ילדים',        2, 'Contacted'],
  ].forEach(r => insert.run(...r));
}

module.exports = db;

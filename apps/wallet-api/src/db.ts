// SQLite access for the mock wallet. Money is integer IQD everywhere; the CHECK constraints are a
// second line of defence behind the application logic (a negative balance is impossible even by bug).
import Database from "better-sqlite3";

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE,
  balance_iqd INTEGER NOT NULL CHECK(balance_iqd >= 0),
  daily_limit_iqd INTEGER NOT NULL CHECK(daily_limit_iqd > 0),
  created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS contacts(
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id),
  display_name TEXT NOT NULL, name_normalised TEXT NOT NULL, relation TEXT,
  phone TEXT NOT NULL, wallet_user_id TEXT REFERENCES users(id), last_used_at INTEGER);
CREATE TABLE IF NOT EXISTS billers(
  id TEXT PRIMARY KEY, code TEXT NOT NULL, name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]', fee_iqd INTEGER NOT NULL DEFAULT 0 CHECK(fee_iqd >= 0),
  status TEXT NOT NULL CHECK(status IN ('active','down','maintenance')));
CREATE TABLE IF NOT EXISTS settlements(
  biller_id TEXT PRIMARY KEY REFERENCES billers(id), balance_iqd INTEGER NOT NULL DEFAULT 0 CHECK(balance_iqd >= 0));
CREATE TABLE IF NOT EXISTS scheduled_payments(
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL CHECK(kind IN ('transfer','bill_pay')),
  body_json TEXT NOT NULL, payload_hash TEXT NOT NULL, run_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('scheduled','executed','failed','cancelled')),
  created_at INTEGER NOT NULL, schedule_key TEXT NOT NULL UNIQUE,
  counterparty TEXT NOT NULL, amount_iqd INTEGER NOT NULL, fee_iqd INTEGER NOT NULL,
  transaction_id TEXT, failure_code TEXT, finished_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_sched_due ON scheduled_payments(status, run_at);
CREATE TABLE IF NOT EXISTS fee_pool(
  id TEXT PRIMARY KEY, balance_iqd INTEGER NOT NULL DEFAULT 0 CHECK(balance_iqd >= 0));
CREATE TABLE IF NOT EXISTS bill_accounts(
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), biller_id TEXT NOT NULL REFERENCES billers(id),
  account_ref TEXT NOT NULL, nickname TEXT);
CREATE TABLE IF NOT EXISTS bills(
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES bill_accounts(id),
  amount_iqd INTEGER NOT NULL CHECK(amount_iqd > 0), due_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('unpaid','paid')));
CREATE TABLE IF NOT EXISTS transactions(
  seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK(kind IN ('transfer','bill_pay')), counterparty TEXT NOT NULL, counterparty_id TEXT NOT NULL,
  amount_iqd INTEGER NOT NULL CHECK(amount_iqd > 0), fee_iqd INTEGER NOT NULL CHECK(fee_iqd >= 0),
  status TEXT NOT NULL CHECK(status IN ('completed')), idempotency_key TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS confirmation_tokens(
  token TEXT PRIMARY KEY, session_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL, used_at INTEGER);
CREATE TABLE IF NOT EXISTS idempotency_keys(
  key TEXT PRIMARY KEY, request_hash TEXT NOT NULL, response_json TEXT NOT NULL,
  status_code INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, session_id TEXT, event TEXT NOT NULL, data_json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_tx_owner ON transactions(owner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_contacts_owner ON contacts(owner_id);
`;

/** ":memory:" for tests/demo, or a file path (WAL mode, shared safely between processes). */
export function openDb(path = ":memory:"): Db {
  const db = new Database(path);
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 10000"); // wait for another writer instead of failing
  if (path !== ":memory:") db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

const TABLES_CHILD_FIRST = [
  "scheduled_payments", "audit_log", "idempotency_keys", "confirmation_tokens", "transactions", "bills", "bill_accounts",
  "settlements", "fee_pool", "billers", "contacts", "users",
];

export function clearAll(db: Db): void {
  db.transaction(() => {
    for (const t of TABLES_CHILD_FIRST) db.exec(`DELETE FROM ${t}`);
    db.exec("DELETE FROM sqlite_sequence");
  }).immediate();
}

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * Opening an existing database must not lose data. This builds a database in
 * the old shape — seven columns that nothing read, since removed — and checks
 * that connecting drops them without disturbing the rows.
 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "promptiplex-migrate-"));
const dbPath = path.join(dir, "old.db");
process.env.PROMPTIPLEX_DB_PATH = dbPath;

const seed = new Database(dbPath);
seed.exec(`
  CREATE TABLE spaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '🔎',
    brief TEXT NOT NULL DEFAULT '',
    query_template TEXT NOT NULL DEFAULT '{q}',
    domains_allow TEXT NOT NULL DEFAULT '[]',
    domains_deny TEXT NOT NULL DEFAULT '[]',
    model TEXT NOT NULL DEFAULT 'sonar',
    search_mode TEXT NOT NULL DEFAULT 'web',
    recency TEXT NOT NULL DEFAULT '',
    context_size TEXT NOT NULL DEFAULT 'medium',
    return_images INTEGER NOT NULL DEFAULT 1,
    return_related_questions INTEGER NOT NULL DEFAULT 1,
    rewrite_enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
seed
  .prepare("INSERT INTO spaces (name, brief, query_template, domains_allow) VALUES (?,?,?,?)")
  .run("Kept", "my instructions", "T: {q}", '["example.com"]');
seed.close();

const { listSpaces } = await import("../src/lib/db");

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("migrating an old database preserves its spaces", () => {
  const spaces = listSpaces();
  assert.equal(spaces.length, 1);
  assert.equal(spaces[0].name, "Kept");
  assert.equal(spaces[0].brief, "my instructions");
  assert.equal(spaces[0].queryTemplate, "T: {q}");
  assert.deepEqual(spaces[0].domainsAllow, ["example.com"]);
});

test("migrating adds the remote columns and removes the unread ones", () => {
  const conn = new Database(dbPath, { readonly: true });
  const columns = (conn.prepare("PRAGMA table_info(spaces)").all() as { name: string }[]).map(
    (c) => c.name,
  );
  conn.close();

  for (const added of ["remote_uuid", "remote_slug"]) {
    assert.ok(columns.includes(added), `expected ${added}`);
  }
  for (const dropped of [
    "model",
    "search_mode",
    "recency",
    "context_size",
    "return_images",
    "return_related_questions",
    "rewrite_enabled",
  ]) {
    assert.ok(!columns.includes(dropped), `expected ${dropped} to be dropped`);
  }
});

import Database from "better-sqlite3";
import path from "node:path";
import type {
  CompiledQuery,
  QueryRecord,
  QueryResult,
  Space,
  SpaceInput,
} from "./types";

const DB_PATH =
  process.env.PROMPTIPLEX_DB_PATH ??
  path.join(process.cwd(), "promptiplex.db");

let db: Database.Database | null = null;

function connect(): Database.Database {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS spaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '🔎',
      brief TEXT NOT NULL DEFAULT '',
      query_template TEXT NOT NULL DEFAULT '{q}',
      domains_allow TEXT NOT NULL DEFAULT '[]',
      domains_deny TEXT NOT NULL DEFAULT '[]',
      remote_uuid TEXT NOT NULL DEFAULT '',
      remote_slug TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS queries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id INTEGER REFERENCES spaces(id) ON DELETE SET NULL,
      question TEXT NOT NULL,
      compiled TEXT NOT NULL,
      result TEXT,
      error TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_queries_space ON queries(space_id);
    CREATE INDEX IF NOT EXISTS idx_queries_created ON queries(created_at DESC);
  `);
  migrate(db);
  return db;
}

/**
 * Additive migrations only. The database is a local cache of the user's spaces
 * and history, so columns are added with defaults and nothing is ever dropped.
 */
function migrate(conn: Database.Database): void {
  const columns = new Set(
    (conn.prepare("PRAGMA table_info(spaces)").all() as { name: string }[]).map((c) => c.name),
  );

  for (const [name, ddl] of [
    ["remote_uuid", "ALTER TABLE spaces ADD COLUMN remote_uuid TEXT NOT NULL DEFAULT ''"],
    ["remote_slug", "ALTER TABLE spaces ADD COLUMN remote_slug TEXT NOT NULL DEFAULT ''"],
  ] as const) {
    if (!columns.has(name)) conn.exec(ddl);
  }

  // Per-space search settings from an earlier design that nothing ever read.
  // Dropped so the schema matches the code; they only ever held their defaults.
  // Model selection is a process-wide env var today — see search/index.ts.
  for (const name of [
    "model",
    "search_mode",
    "recency",
    "context_size",
    "return_images",
    "return_related_questions",
    "rewrite_enabled",
  ]) {
    if (!columns.has(name)) continue;
    try {
      conn.exec(`ALTER TABLE spaces DROP COLUMN ${name}`);
    } catch {
      // Older SQLite cannot drop columns. Leaving them costs nothing.
    }
  }
}

type SpaceRow = {
  id: number;
  name: string;
  icon: string;
  brief: string;
  query_template: string;
  domains_allow: string;
  domains_deny: string;
  remote_uuid: string;
  remote_slug: string;
  created_at: string;
  updated_at: string;
};

function rowToSpace(r: SpaceRow): Space {
  return {
    id: r.id,
    name: r.name,
    icon: r.icon,
    brief: r.brief,
    queryTemplate: r.query_template,
    domainsAllow: JSON.parse(r.domains_allow),
    domainsDeny: JSON.parse(r.domains_deny),
    remoteUuid: r.remote_uuid,
    remoteSlug: r.remote_slug,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listSpaces(): Space[] {
  return connect()
    .prepare("SELECT * FROM spaces ORDER BY name COLLATE NOCASE")
    .all()
    .map((r) => rowToSpace(r as SpaceRow));
}

export function getSpace(id: number): Space | null {
  const row = connect().prepare("SELECT * FROM spaces WHERE id = ?").get(id);
  return row ? rowToSpace(row as SpaceRow) : null;
}

export function createSpace(input: SpaceInput): Space {
  const info = connect()
    .prepare(
      `INSERT INTO spaces (
        name, icon, brief, query_template, domains_allow, domains_deny,
        remote_uuid, remote_slug
      ) VALUES (?,?,?,?,?,?,?,?)`,
    )
    .run(
      input.name,
      input.icon,
      input.brief,
      input.queryTemplate,
      JSON.stringify(input.domainsAllow),
      JSON.stringify(input.domainsDeny),
      input.remoteUuid,
      input.remoteSlug,
    );
  return getSpace(Number(info.lastInsertRowid))!;
}

export function updateSpace(id: number, input: SpaceInput): Space | null {
  connect()
    .prepare(
      `UPDATE spaces SET
        name=?, icon=?, brief=?, query_template=?, domains_allow=?, domains_deny=?,
        remote_uuid=?, remote_slug=?,
        updated_at=datetime('now')
       WHERE id=?`,
    )
    .run(
      input.name,
      input.icon,
      input.brief,
      input.queryTemplate,
      JSON.stringify(input.domainsAllow),
      JSON.stringify(input.domainsDeny),
      input.remoteUuid,
      input.remoteSlug,
      id,
    );
  return getSpace(id);
}

export function findSpaceByRemoteUuid(uuid: string): Space | null {
  if (!uuid) return null;
  const row = connect().prepare("SELECT * FROM spaces WHERE remote_uuid = ?").get(uuid);
  return row ? rowToSpace(row as SpaceRow) : null;
}

export function deleteSpace(id: number): void {
  connect().prepare("DELETE FROM spaces WHERE id = ?").run(id);
}

export function recordQuery(args: {
  spaceId: number | null;
  question: string;
  compiled: CompiledQuery;
  result: QueryResult | null;
  error: string | null;
  durationMs: number;
}): number {
  const info = connect()
    .prepare(
      `INSERT INTO queries (space_id, question, compiled, result, error, duration_ms)
       VALUES (?,?,?,?,?,?)`,
    )
    .run(
      args.spaceId,
      args.question,
      JSON.stringify(args.compiled),
      args.result ? JSON.stringify(args.result) : null,
      args.error,
      args.durationMs,
    );
  return Number(info.lastInsertRowid);
}

type QueryRow = {
  id: number;
  space_id: number | null;
  space_name: string | null;
  space_icon: string | null;
  question: string;
  compiled: string;
  result: string | null;
  error: string | null;
  duration_ms: number;
  created_at: string;
};

export function listQueries(opts: { spaceId?: number; limit?: number } = {}): QueryRecord[] {
  const limit = opts.limit ?? 50;
  const where = opts.spaceId ? "WHERE q.space_id = ?" : "";
  const params = opts.spaceId ? [opts.spaceId, limit] : [limit];
  const rows = connect()
    .prepare(
      `SELECT q.*, s.name AS space_name, s.icon AS space_icon
       FROM queries q LEFT JOIN spaces s ON s.id = q.space_id
       ${where}
       ORDER BY q.id DESC LIMIT ?`,
    )
    .all(...params) as QueryRow[];

  return rows.map((r) => ({
    id: r.id,
    spaceId: r.space_id,
    spaceName: r.space_name,
    spaceIcon: r.space_icon,
    question: r.question,
    compiled: JSON.parse(r.compiled),
    result: r.result ? JSON.parse(r.result) : null,
    error: r.error,
    durationMs: r.duration_ms,
    createdAt: r.created_at,
  }));
}

export function countSpaces(): number {
  const row = connect().prepare("SELECT COUNT(*) AS n FROM spaces").get() as {
    n: number;
  };
  return row.n;
}

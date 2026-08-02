import Database from "better-sqlite3";
import path from "node:path";
import type {
  CompiledQuery,
  Conversation,
  QueryRecord,
  QueryResult,
  Space,
  SpaceInput,
} from "./types";

const DB_PATH =
  process.env.PROMPTIPLEX_DB_PATH ??
  path.join(process.cwd(), "promptiplex.db");

let db: Database.Database | null = null;

/**
 * Milliseconds, unlike `datetime('now')`, which is whole seconds.
 *
 * Conversations are listed most-recently-used first, and several can easily be
 * touched inside one second — asking a question in an older conversation has to
 * lift it above one started moments earlier. The format still sorts and reads
 * as an ISO-ish string, so it compares correctly against the second-precision
 * timestamps written before this.
 */
const NOW = "strftime('%Y-%m-%d %H:%M:%f','now')";

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

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id INTEGER REFERENCES spaces(id) ON DELETE SET NULL,
      title TEXT NOT NULL DEFAULT '',
      thread_url TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f','now'))
    );

    CREATE TABLE IF NOT EXISTS queries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id INTEGER REFERENCES spaces(id) ON DELETE SET NULL,
      conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
      turn INTEGER NOT NULL DEFAULT 1,
      question TEXT NOT NULL,
      compiled TEXT NOT NULL,
      result TEXT,
      error TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

  `);

  // Indexes come after the migration, not with the tables above: an existing
  // database reaches its current shape in `migrate`, and an index cannot name a
  // column that has not been added to it yet.
  migrate(db);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_queries_space ON queries(space_id);
    CREATE INDEX IF NOT EXISTS idx_queries_created ON queries(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_queries_conversation ON queries(conversation_id, turn);
    CREATE INDEX IF NOT EXISTS idx_conversations_space ON conversations(space_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
  `);
  return db;
}

/**
 * Additive migrations only. The database is a local cache of the user's spaces
 * and history, so columns are added with defaults and nothing is ever dropped.
 */
function migrate(conn: Database.Database): void {
  const columnsOf = (table: string) =>
    new Set(
      (conn.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name),
    );

  const columns = columnsOf("spaces");

  const queryColumns = columnsOf("queries");
  for (const [name, ddl] of [
    // SQLite allows a foreign key to be added only when it defaults to NULL,
    // which is what a query with no conversation yet should be anyway.
    [
      "conversation_id",
      "ALTER TABLE queries ADD COLUMN conversation_id INTEGER REFERENCES conversations(id)",
    ],
    ["turn", "ALTER TABLE queries ADD COLUMN turn INTEGER NOT NULL DEFAULT 1"],
  ] as const) {
    if (!queryColumns.has(name)) conn.exec(ddl);
  }

  for (const [name, ddl] of [
    ["remote_uuid", "ALTER TABLE spaces ADD COLUMN remote_uuid TEXT NOT NULL DEFAULT ''"],
    ["remote_slug", "ALTER TABLE spaces ADD COLUMN remote_slug TEXT NOT NULL DEFAULT ''"],
  ] as const) {
    if (!columns.has(name)) conn.exec(ddl);
  }

  backfillConversations(conn);

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

/**
 * Gives every query recorded before conversations existed one of its own, so
 * the history reads uniformly instead of splitting into "before" and "after".
 * A single-turn conversation is exactly what those queries were.
 */
function backfillConversations(conn: Database.Database): void {
  const orphans = conn
    .prepare(
      `SELECT id, space_id, question, result, created_at
       FROM queries WHERE conversation_id IS NULL ORDER BY id`,
    )
    .all() as {
    id: number;
    space_id: number | null;
    question: string;
    result: string | null;
    created_at: string;
  }[];
  if (!orphans.length) return;

  const insert = conn.prepare(
    `INSERT INTO conversations (space_id, title, thread_url, provider, created_at, updated_at)
     VALUES (?,?,?,?,?,?)`,
  );
  const attach = conn.prepare("UPDATE queries SET conversation_id = ?, turn = 1 WHERE id = ?");

  conn.transaction(() => {
    for (const q of orphans) {
      let threadUrl = "";
      let provider = "";
      try {
        const parsed = q.result ? (JSON.parse(q.result) as QueryResult) : null;
        threadUrl = parsed?.threadUrl ?? "";
        provider = parsed?.provider ?? "";
      } catch {
        // A result that will not parse is not worth failing a migration over.
      }
      const info = insert.run(
        q.space_id,
        titleFor(q.question),
        threadUrl,
        provider,
        q.created_at,
        q.created_at,
      );
      attach.run(Number(info.lastInsertRowid), q.id);
    }
  })();
}

/** A conversation is named after the question that started it. */
export function titleFor(question: string): string {
  const one = question.trim().replace(/\s+/g, " ");
  return one.length > 80 ? `${one.slice(0, 79)}…` : one || "Untitled";
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

type ConversationRow = {
  id: number;
  space_id: number | null;
  space_name: string | null;
  space_icon: string | null;
  title: string;
  thread_url: string;
  provider: string;
  turn_count: number;
  created_at: string;
  updated_at: string;
};

function rowToConversation(r: ConversationRow): Conversation {
  return {
    id: r.id,
    spaceId: r.space_id,
    spaceName: r.space_name,
    spaceIcon: r.space_icon,
    title: r.title,
    threadUrl: r.thread_url,
    provider: r.provider,
    turnCount: r.turn_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const CONVERSATION_SELECT = `
  SELECT c.*, s.name AS space_name, s.icon AS space_icon,
         (SELECT COUNT(*) FROM queries q WHERE q.conversation_id = c.id) AS turn_count
  FROM conversations c LEFT JOIN spaces s ON s.id = c.space_id`;

export function createConversation(args: {
  spaceId: number | null;
  title: string;
}): Conversation {
  const info = connect()
    .prepare("INSERT INTO conversations (space_id, title) VALUES (?,?)")
    .run(args.spaceId, titleFor(args.title));
  return getConversation(Number(info.lastInsertRowid))!;
}

export function getConversation(id: number): Conversation | null {
  const row = connect().prepare(`${CONVERSATION_SELECT} WHERE c.id = ?`).get(id);
  return row ? rowToConversation(row as ConversationRow) : null;
}

export function listConversations(
  opts: { spaceId?: number; limit?: number } = {},
): Conversation[] {
  const limit = opts.limit ?? 100;
  const where = opts.spaceId ? "WHERE c.space_id = ?" : "";
  const params = opts.spaceId ? [opts.spaceId, limit] : [limit];
  return (
    connect()
      .prepare(`${CONVERSATION_SELECT} ${where} ORDER BY c.updated_at DESC, c.id DESC LIMIT ?`)
      .all(...params) as ConversationRow[]
  ).map(rowToConversation);
}

/**
 * Records where the provider filed this exchange, so a later turn can be added
 * to it. Only set when the provider reported one; a stateless provider leaves
 * it empty and is continued by resending the turns instead.
 */
export function setConversationThread(
  id: number,
  args: { threadUrl?: string; provider?: string },
): void {
  connect()
    .prepare(
      `UPDATE conversations SET
         thread_url = COALESCE(NULLIF(?, ''), thread_url),
         provider   = COALESCE(NULLIF(?, ''), provider),
         updated_at = ${NOW}
       WHERE id = ?`,
    )
    .run(args.threadUrl ?? "", args.provider ?? "", id);
}

export function deleteConversation(id: number): void {
  const conn = connect();
  conn.transaction(() => {
    // Foreign keys are off by default in SQLite, so the cascade is explicit.
    conn.prepare("DELETE FROM queries WHERE conversation_id = ?").run(id);
    conn.prepare("DELETE FROM conversations WHERE id = ?").run(id);
  })();
}

export function nextTurn(conversationId: number): number {
  const row = connect()
    .prepare("SELECT COALESCE(MAX(turn), 0) AS n FROM queries WHERE conversation_id = ?")
    .get(conversationId) as { n: number };
  return row.n + 1;
}

export function recordQuery(args: {
  spaceId: number | null;
  conversationId: number | null;
  turn: number;
  question: string;
  compiled: CompiledQuery;
  result: QueryResult | null;
  error: string | null;
  durationMs: number;
}): number {
  const conn = connect();
  const info = conn
    .prepare(
      `INSERT INTO queries
         (space_id, conversation_id, turn, question, compiled, result, error, duration_ms)
       VALUES (?,?,?,?,?,?,?,?)`,
    )
    .run(
      args.spaceId,
      args.conversationId,
      args.turn,
      args.question,
      JSON.stringify(args.compiled),
      args.result ? JSON.stringify(args.result) : null,
      args.error,
      args.durationMs,
    );

  // Sorting conversations by recency is the whole point of the sidebar, so a
  // failed turn bumps the conversation too — it is still something that happened.
  if (args.conversationId) {
    conn
      .prepare(`UPDATE conversations SET updated_at = ${NOW} WHERE id = ?`)
      .run(args.conversationId);
  }
  return Number(info.lastInsertRowid);
}

type QueryRow = {
  id: number;
  space_id: number | null;
  space_name: string | null;
  space_icon: string | null;
  conversation_id: number | null;
  turn: number;
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

  return rows.map(rowToQuery);
}

function rowToQuery(r: QueryRow): QueryRecord {
  return {
    id: r.id,
    spaceId: r.space_id,
    spaceName: r.space_name,
    spaceIcon: r.space_icon,
    conversationId: r.conversation_id,
    turn: r.turn,
    question: r.question,
    compiled: JSON.parse(r.compiled),
    result: r.result ? JSON.parse(r.result) : null,
    error: r.error,
    durationMs: r.duration_ms,
    createdAt: r.created_at,
  };
}

/** The turns of one conversation, oldest first — the order they are read in. */
export function listTurns(conversationId: number): QueryRecord[] {
  const rows = connect()
    .prepare(
      `SELECT q.*, s.name AS space_name, s.icon AS space_icon
       FROM queries q LEFT JOIN spaces s ON s.id = q.space_id
       WHERE q.conversation_id = ?
       ORDER BY q.turn, q.id`,
    )
    .all(conversationId) as QueryRow[];
  return rows.map(rowToQuery);
}

export function countSpaces(): number {
  const row = connect().prepare("SELECT COUNT(*) AS n FROM spaces").get() as {
    n: number;
  };
  return row.n;
}

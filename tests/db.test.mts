import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// db.ts resolves its path once at import, so this must be set first.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "promptiplex-test-"));
process.env.PROMPTIPLEX_DB_PATH = path.join(dir, "test.db");

const {
  createSpace,
  listSpaces,
  getSpace,
  updateSpace,
  deleteSpace,
  recordQuery,
  listQueries,
  countSpaces,
  findSpaceByRemoteUuid,
  createConversation,
  getConversation,
  listConversations,
  listTurns,
  nextTurn,
  setConversationThread,
  deleteConversation,
  titleFor,
} = await import("../src/lib/db");
const { spaceInputSchema } = await import("../src/lib/types");
const { seedIfEmpty } = await import("../src/lib/seed");

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const input = (over = {}) => spaceInputSchema.parse({ name: "Test", ...over });

test("round-trips a space through create and read", () => {
  const s = createSpace(
    input({ brief: "b", queryTemplate: "T: {q}", domainsAllow: ["a.com"], icon: "⛏️" }),
  );
  const got = getSpace(s.id)!;
  assert.equal(got.name, "Test");
  assert.equal(got.icon, "⛏️");
  assert.equal(got.brief, "b");
  assert.equal(got.queryTemplate, "T: {q}");
  assert.deepEqual(got.domainsAllow, ["a.com"]);
  assert.deepEqual(got.domainsDeny, []);
});

test("updates a space in place", () => {
  const s = createSpace(input({ name: "Before" }));
  updateSpace(s.id, input({ name: "After", domainsDeny: ["x.com"] }));
  const got = getSpace(s.id)!;
  assert.equal(got.name, "After");
  assert.deepEqual(got.domainsDeny, ["x.com"]);
});

test("returns null for a missing space", () => {
  assert.equal(getSpace(999_999), null);
});

test("lists spaces case-insensitively by name", () => {
  const before = countSpaces();
  createSpace(input({ name: "zebra" }));
  createSpace(input({ name: "Apple" }));
  const names = listSpaces().map((s) => s.name);
  assert.equal(names.length, before + 2);
  assert.deepEqual([...names].sort((a, b) => a.localeCompare(b)), names);
});

test("records a successful query and reads it back", () => {
  const s = createSpace(input({ name: "Q" }));
  const id = recordQuery({
    spaceId: s.id,
    conversationId: null,
    turn: 1,
    question: "chickens?",
    compiled: { text: "Context: c\n\nchickens?", parts: [], warnings: [], filters: { domainsAllow: [], domainsDeny: [] } },
    result: { answer: "feed seeds", sources: [], images: [], provider: "sonar", usage: { model: "sonar", inputTokens: 12, outputTokens: 30, searchQueries: 2, costUsd: 0.0061 } },
    error: null,
    durationMs: 1234,
  });
  const rec = listQueries({ spaceId: s.id })[0];
  assert.equal(rec.id, id);
  assert.equal(rec.question, "chickens?");
  assert.equal(rec.result?.answer, "feed seeds");
  assert.equal(rec.compiled.text, "Context: c\n\nchickens?");
  assert.equal(rec.durationMs, 1234);
  assert.equal(rec.error, null);
  assert.equal(rec.spaceName, "Q");
});

test("records a failed query so history shows attempts, not just successes", () => {
  const s = createSpace(input({ name: "F" }));
  recordQuery({
    spaceId: s.id,
    conversationId: null,
    turn: 1,
    question: "x",
    compiled: { text: "x", parts: [], warnings: [], filters: { domainsAllow: [], domainsDeny: [] } },
    result: null,
    error: "Not signed in",
    durationMs: 5,
  });
  const rec = listQueries({ spaceId: s.id })[0];
  assert.equal(rec.result, null);
  assert.equal(rec.error, "Not signed in");
});

test("keeps a deleted space's queries, detaching them", () => {
  const s = createSpace(input({ name: "Doomed" }));
  recordQuery({
    spaceId: s.id,
    conversationId: null,
    turn: 1,
    question: "kept?",
    compiled: { text: "kept?", parts: [], warnings: [], filters: { domainsAllow: [], domainsDeny: [] } },
    result: null,
    error: null,
    durationMs: 1,
  });
  deleteSpace(s.id);
  assert.equal(getSpace(s.id), null);
  const kept = listQueries({ limit: 200 }).find((q) => q.question === "kept?");
  assert.ok(kept, "query should survive its space");
  assert.equal(kept!.spaceId, null);
});

test("returns queries newest first", () => {
  const s = createSpace(input({ name: "Order" }));
  for (const q of ["first", "second", "third"]) {
    recordQuery({
      spaceId: s.id,
      conversationId: null,
      turn: 1,
      question: q,
      compiled: { text: q, parts: [], warnings: [], filters: { domainsAllow: [], domainsDeny: [] } },
      result: null,
      error: null,
      durationMs: 1,
    });
  }
  assert.deepEqual(
    listQueries({ spaceId: s.id }).map((q) => q.question),
    ["third", "second", "first"],
  );
});

test("seeding is a no-op once any space exists", () => {
  const before = countSpaces();
  seedIfEmpty();
  assert.equal(countSpaces(), before);
});

test("finds an imported space by its Perplexity uuid, and ignores local ones", () => {
  const remote = createSpace(
    input({ name: "Imported", remoteUuid: "uuid-abc", remoteSlug: "imported-xyz", brief: "b" }),
  );
  const local = createSpace(input({ name: "Local only" }));

  assert.equal(findSpaceByRemoteUuid("uuid-abc")?.id, remote.id);
  assert.equal(findSpaceByRemoteUuid("uuid-missing"), null);
  // A blank uuid must not match the many locally-created spaces that have one.
  assert.equal(findSpaceByRemoteUuid(""), null);
  assert.equal(getSpace(local.id)!.remoteUuid, "");
});

const compiled = (text: string) => ({
  text,
  parts: [{ label: "question", text }],
  warnings: [],
  filters: { domainsAllow: [], domainsDeny: [] },
});

const answer = (text: string, over = {}) => ({
  answer: text,
  sources: [],
  images: [],
  provider: "sonar",
  ...over,
});

/** Records one answered turn, the way the query route does. */
function addTurn(spaceId: number, conversationId: number, question: string, reply: string) {
  return recordQuery({
    spaceId,
    conversationId,
    turn: nextTurn(conversationId),
    question,
    compiled: compiled(question),
    result: answer(reply),
    error: null,
    durationMs: 1,
  });
}

test("names a conversation after the question that opened it", () => {
  assert.equal(titleFor("  how do I   raise chickens? "), "how do I raise chickens?");
  assert.equal(titleFor(""), "Untitled");
  const long = titleFor("x".repeat(200));
  assert.equal(long.length, 80);
  assert.ok(long.endsWith("…"));
});

test("reads a conversation's turns back in the order they were asked", () => {
  const s = createSpace(input({ name: "Threaded" }));
  const c = createConversation({ spaceId: s.id, title: "first question" });

  addTurn(s.id, c.id, "first question", "first answer");
  addTurn(s.id, c.id, "second question", "second answer");
  addTurn(s.id, c.id, "third question", "third answer");

  const got = listTurns(c.id);
  assert.deepEqual(got.map((t) => t.question), [
    "first question",
    "second question",
    "third question",
  ]);
  assert.deepEqual(got.map((t) => t.turn), [1, 2, 3]);
  assert.equal(getConversation(c.id)!.turnCount, 3);
});

test("counts the next turn from what is already recorded", () => {
  const s = createSpace(input({ name: "Counting" }));
  const c = createConversation({ spaceId: s.id, title: "q" });
  assert.equal(nextTurn(c.id), 1);
  addTurn(s.id, c.id, "q", "a");
  assert.equal(nextTurn(c.id), 2);
});

test("a failed turn still occupies its place in the conversation", () => {
  const s = createSpace(input({ name: "Partly failed" }));
  const c = createConversation({ spaceId: s.id, title: "q1" });
  addTurn(s.id, c.id, "q1", "a1");
  recordQuery({
    spaceId: s.id,
    conversationId: c.id,
    turn: nextTurn(c.id),
    question: "q2",
    compiled: compiled("q2"),
    result: null,
    error: "Perplexity is rate limiting this key.",
    durationMs: 2,
  });

  const got = listTurns(c.id);
  assert.equal(got.length, 2);
  assert.equal(got[1].error, "Perplexity is rate limiting this key.");
  assert.equal(got[1].result, null);
  // The next question is turn 3 — a failed attempt is not silently reused.
  assert.equal(nextTurn(c.id), 3);
});

test("lists conversations for one space, most recently used first", async () => {
  const a = createSpace(input({ name: "Space A" }));
  const b = createSpace(input({ name: "Space B" }));
  const older = createConversation({ spaceId: a.id, title: "older" });
  const newer = createConversation({ spaceId: a.id, title: "newer" });
  createConversation({ spaceId: b.id, title: "elsewhere" });

  const listed = listConversations({ spaceId: a.id });
  assert.deepEqual(listed.map((c) => c.title), ["newer", "older"]);
  assert.equal(listed[0].spaceName, "Space A");
  assert.equal(listed.length, 2, "the other space's conversation is not listed here");

  // Timestamps are millisecond-precision, and these rows are written far faster
  // than that. A real turn is a network round trip, so this only buys back the
  // gap that time would otherwise provide.
  await new Promise((r) => setTimeout(r, 20));

  // Answering in the older one brings it back to the top.
  addTurn(a.id, older.id, "still going", "sure");
  assert.equal(listConversations({ spaceId: a.id })[0].id, older.id);
  assert.equal(getConversation(newer.id)!.turnCount, 0);
});

test("remembers where a provider filed the exchange, and keeps it once set", () => {
  const s = createSpace(input({ name: "Threaded provider" }));
  const c = createConversation({ spaceId: s.id, title: "q" });
  assert.equal(c.threadUrl, "");

  setConversationThread(c.id, { threadUrl: "https://example.test/t/1", provider: "sonar" });
  assert.equal(getConversation(c.id)!.threadUrl, "https://example.test/t/1");

  // A later turn from a provider that reports no thread must not erase it.
  setConversationThread(c.id, { threadUrl: "", provider: "sonar" });
  assert.equal(getConversation(c.id)!.threadUrl, "https://example.test/t/1");
});

test("deleting a conversation takes its turns with it", () => {
  const s = createSpace(input({ name: "Doomed thread" }));
  const c = createConversation({ spaceId: s.id, title: "q" });
  addTurn(s.id, c.id, "q", "a");

  deleteConversation(c.id);
  assert.equal(getConversation(c.id), null);
  assert.equal(listTurns(c.id).length, 0);
});

test("round-trips the remote identifiers", () => {
  const s = createSpace(input({ name: "R", remoteUuid: "u1", remoteSlug: "slug-1" }));
  const got = getSpace(s.id)!;
  assert.equal(got.remoteUuid, "u1");
  assert.equal(got.remoteSlug, "slug-1");
});

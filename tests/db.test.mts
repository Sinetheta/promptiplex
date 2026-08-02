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

test("round-trips the remote identifiers", () => {
  const s = createSpace(input({ name: "R", remoteUuid: "u1", remoteSlug: "slug-1" }));
  const got = getSpace(s.id)!;
  assert.equal(got.remoteUuid, "u1");
  assert.equal(got.remoteSlug, "slug-1");
});

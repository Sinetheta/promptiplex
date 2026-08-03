import test from "node:test";
import assert from "node:assert/strict";
import {
  applyEdit,
  describeEdit,
  parsePlan,
  rollbackFor,
  toInput,
} from "../src/lib/spacePlan";
import type { Space } from "../src/lib/types";

const space = (over: Partial<Space> = {}): Space => ({
  id: 4,
  name: "ONI",
  icon: "📁",
  brief: "Assume every question is about Oxygen Not Included.",
  queryTemplate: "{q}",
  domainsAllow: ["oxygennotincluded.fandom.com"],
  domainsDeny: [],
  remoteUuid: "",
  remoteSlug: "",
  createdAt: "2026-01-01 00:00:00",
  updatedAt: "2026-01-01 00:00:00",
  ...over,
});

test("edits only the fields the plan wrote", () => {
  const s = space();
  const after = applyEdit(s, { id: 4, set: { brief: "shorter" } });

  assert.equal(after.brief, "shorter");
  // The schema defaults these; an edit that did not mention them must not
  // quietly reset the space to the defaults.
  assert.equal(after.queryTemplate, "{q}");
  assert.deepEqual(after.domainsAllow, ["oxygennotincluded.fandom.com"]);
  assert.equal(after.name, "ONI");
  assert.equal(after.icon, "📁");
});

test("an empty string is an edit, not an absent field", () => {
  const after = applyEdit(space(), { id: 4, set: { brief: "" } });
  assert.equal(after.brief, "");
});

test("refuses a field name it does not recognise", () => {
  assert.throws(
    () => applyEdit(space(), { id: 4, set: { template: "ONI: {q}" } }),
    /template/,
  );
});

test("refuses a value the space schema would reject", () => {
  assert.throws(() => applyEdit(space(), { id: 4, set: { name: "" } }));
});

test("refuses a plan written against a different name", () => {
  assert.throws(
    () => applyEdit(space({ name: "Oxygen Not Included" }), { id: 4, expect: "ONI", set: {} }),
    /written against/,
  );
});

test("reports only the fields that moved", () => {
  const s = space();
  const after = applyEdit(s, { id: 4, set: { brief: "new", queryTemplate: "{q}" } });
  const moved = describeEdit(toInput(s), after);

  assert.deepEqual(
    moved.map((m) => m.field),
    ["brief"],
  );
});

test("rollback restores the previous wording", () => {
  const s = space();
  const after = applyEdit(s, {
    id: 4,
    set: { brief: "new", queryTemplate: "ONI: {q}" },
  });

  const undo = rollbackFor(s, after)!;
  assert.equal(undo.id, 4);
  assert.deepEqual(undo.set, {
    brief: "Assume every question is about Oxygen Not Included.",
    queryTemplate: "{q}",
  });

  // Applying it to the edited space puts every field back where it started.
  const restored = applyEdit(space({ ...after, id: 4 }), undo);
  assert.deepEqual(restored, toInput(s));
});

test("rollback is null when nothing moved", () => {
  const s = space();
  assert.equal(rollbackFor(s, toInput(s)), null);
});

test("a plan needs at least one change", () => {
  assert.throws(() => parsePlan({ changes: [] }), /Not a usable plan/);
});

test("parses a plan with why and expect", () => {
  const plan = parsePlan({
    changes: [{ id: 4, expect: "ONI", why: "names the game", set: { brief: "…" } }],
  });
  assert.equal(plan.changes[0].why, "names the game");
});

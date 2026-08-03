import test from "node:test";
import assert from "node:assert/strict";
import { spaceFingerprint } from "../src/lib/spaceVersion";
import { spaceInputSchema } from "../src/lib/types";

const space = (over = {}) => spaceInputSchema.parse({ name: "S", ...over });

test("the same wording fingerprints the same, every time", () => {
  const a = space({ brief: "b", queryTemplate: "T: {q}", domainsAllow: ["a.com"] });
  const b = space({ brief: "b", queryTemplate: "T: {q}", domainsAllow: ["a.com"] });
  assert.equal(spaceFingerprint(a), spaceFingerprint(b));
});

test("every field that is sent changes the fingerprint", () => {
  const base = space({ brief: "b", queryTemplate: "T: {q}" });
  const original = spaceFingerprint(base);

  assert.notEqual(spaceFingerprint(space({ brief: "b!", queryTemplate: "T: {q}" })), original);
  assert.notEqual(spaceFingerprint(space({ brief: "b", queryTemplate: "U: {q}" })), original);
  assert.notEqual(
    spaceFingerprint(space({ brief: "b", queryTemplate: "T: {q}", domainsAllow: ["a.com"] })),
    original,
  );
  assert.notEqual(
    spaceFingerprint(space({ brief: "b", queryTemplate: "T: {q}", domainsDeny: ["a.com"] })),
    original,
  );
});

test("name and icon do not, because they are never sent", () => {
  const before = spaceFingerprint(space({ name: "Before", icon: "🔎", brief: "b" }));
  const after = spaceFingerprint(space({ name: "After", icon: "📄", brief: "b" }));
  assert.equal(before, after);
});

test("domain order counts, because the provider truncates a long list", () => {
  const one = spaceFingerprint(space({ domainsAllow: ["a.com", "b.com"] }));
  const other = spaceFingerprint(space({ domainsAllow: ["b.com", "a.com"] }));
  assert.notEqual(one, other);
});

test("an allow list is not the same wording as the matching deny list", () => {
  const allow = spaceFingerprint(space({ domainsAllow: ["a.com"] }));
  const deny = spaceFingerprint(space({ domainsDeny: ["a.com"] }));
  assert.notEqual(allow, deny);
});

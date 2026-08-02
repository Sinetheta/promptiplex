import test from "node:test";
import assert from "node:assert/strict";
import { compile } from "../src/lib/compile";
import type { Space } from "../src/lib/types";

function space(over: Partial<Space> = {}): Space {
  return {
    id: 1,
    name: "Test",
    icon: "🔎",
    brief: "",
    queryTemplate: "{q}",
    domainsAllow: [],
    domainsDeny: [],
    remoteUuid: "",
    remoteSlug: "",
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

test("substitutes the question into the template", () => {
  const c = compile(space({ queryTemplate: "Minecraft 1.21: {q}" }), "how do I raise chickens?");
  assert.equal(c.text, "Minecraft 1.21: how do I raise chickens?");
  assert.deepEqual(c.warnings, []);
});

test("replaces every occurrence of the placeholder", () => {
  const c = compile(space({ queryTemplate: "{q} — restated: {q}" }), "why");
  assert.equal(c.text, "why — restated: why");
});

test("appends the question and warns when the template lacks {q}", () => {
  const c = compile(space({ queryTemplate: "golang" }), "how do slices work");
  assert.equal(c.text, "golang how do slices work");
  assert.match(c.warnings.join(" "), /no \{q\} placeholder/);
});

test("prefixes the brief as context and keeps the parts labelled", () => {
  const c = compile(space({ brief: "I play survival." }), "chickens?");
  assert.equal(c.parts[0].label, "brief");
  assert.equal(c.parts[0].text, "Context: I play survival.");
  assert.equal(c.parts[1].label, "question");
  assert.ok(c.text.startsWith("Context: I play survival."));
});

test("omits the brief part entirely when there is no brief", () => {
  const c = compile(space(), "chickens?");
  assert.deepEqual(
    c.parts.map((p) => p.label),
    ["question"],
  );
  assert.equal(c.text, "chickens?");
});

test("normalises domains into filters, keeping allow and deny apart", () => {
  const c = compile(
    space({
      domainsAllow: ["https://www.minecraft.wiki/wiki/Chicken", " reddit.com "],
      domainsDeny: ["www.pinterest.com"],
    }),
    "chickens?",
  );
  assert.deepEqual(c.filters.domainsAllow, ["minecraft.wiki", "reddit.com"]);
  assert.deepEqual(c.filters.domainsDeny, ["pinterest.com"]);
});

test("keeps source preferences out of the query text", () => {
  // They travel as a filter the provider applies, so restating them in the
  // query would only spend tokens on something already enforced.
  const c = compile(space({ domainsAllow: ["a.com"], domainsDeny: ["b.com"] }), "Q");
  assert.equal(c.text, "Q");
  assert.deepEqual(
    c.parts.map((p) => p.label),
    ["question"],
  );
});

test("drops empty domain entries rather than emitting stray filter values", () => {
  const c = compile(space({ domainsAllow: ["", "  ", "example.com"] }), "q");
  assert.deepEqual(c.filters.domainsAllow, ["example.com"]);
});

test("joins parts with blank lines so they stay distinct", () => {
  const c = compile(
    space({ brief: "B", queryTemplate: "T: {q}", domainsAllow: ["a.com"] }),
    "Q",
  );
  assert.equal(c.text, "Context: B\n\nT: Q");
});

test("warns when the compiled query is long enough to crowd out the question", () => {
  const c = compile(space({ brief: "x".repeat(6100) }), "q");
  assert.match(c.warnings.join(" "), /characters/);
});

test("stays quiet for a realistically sized imported space", () => {
  // Real Perplexity spaces run to roughly 4k characters of instructions.
  const c = compile(space({ brief: "x".repeat(4062) }), "q");
  assert.deepEqual(c.warnings, []);
});

test("warns on an empty question", () => {
  const c = compile(space(), "   ");
  assert.match(c.warnings.join(" "), /question is empty/i);
});


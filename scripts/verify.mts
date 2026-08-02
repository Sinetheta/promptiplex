/**
 * Confirms the configured provider actually answers.
 *
 *   npm run verify           # sends ONE small query — this costs money
 *   npm run verify -- --dry  # checks configuration only, sends nothing
 *
 * Deliberately not part of `npm run check` or CI: the test suite must never
 * spend anything or depend on a key being present.
 */
import { resolveProvider } from "../src/lib/search";

const dry = process.argv.slice(2).some((a) => a === "--dry" || a === "-n");

const ok = (m: string) => console.log(`  ok      ${m}`);
const bad = (m: string) => console.log(`  FAILED  ${m}`);

console.log("\nChecking provider configuration");
console.log("─".repeat(60));

let provider;
try {
  provider = await resolveProvider();
  ok(`provider "${provider.id}" — ${provider.label}`);
  ok(
    provider.appliesFiltersNatively
      ? "source preferences are applied as a real filter"
      : "source preferences are stated in the query text as a request",
  );
} catch (err) {
  bad((err as Error).message);
  process.exit(1);
}

if (dry) {
  console.log("\n(dry run — nothing sent)\n");
  process.exit(0);
}

console.log("\nSending one query");
console.log("─".repeat(60));

try {
  const started = Date.now();
  const res = await provider.search({
    // Short, factual, and cheap. The point is to prove the round trip works,
    // not to test the quality of the answer.
    query: "In one short sentence, what is the capital of France?",
    filters: { domainsAllow: [], domainsDeny: [] },
  });

  ok(`answer received (${res.answerMarkdown.length} chars, ${((Date.now() - started) / 1000).toFixed(1)}s)`);
  ok(`${res.sources.length} sources`);
  for (const w of res.warnings) console.log(`  warning ${w}`);

  if (res.usage) {
    const cost =
      typeof res.usage.costUsd === "number" ? `$${res.usage.costUsd.toFixed(4)}` : "not reported";
    ok(`model ${res.usage.model}, cost ${cost}`);
  }

  console.log(`\n  "${res.answerMarkdown.slice(0, 120).replace(/\s+/g, " ").trim()}"\n`);
} catch (err) {
  bad((err as Error).message);
  process.exitCode = 1;
}

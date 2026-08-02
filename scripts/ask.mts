/**
 * Runs one query end to end from the terminal — compile a space, send it,
 * print the answer. The same code path the web UI uses.
 *
 *   npm run ask -- "how do I raise chickens?"
 *   npm run ask -- --space Minecraft "how do I raise chickens?"
 *   npm run ask -- --dry "how do I raise chickens?"     # compile only, free
 */
import { listSpaces } from "../src/lib/db";
import { seedIfEmpty } from "../src/lib/seed";
import { compile } from "../src/lib/compile";
import { foldFiltersIntoQuery, resolveProvider } from "../src/lib/search";

const argv = process.argv.slice(2);
let spaceName: string | null = null;
let dry = false;
const rest: string[] = [];

for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--space" || argv[i] === "-s") spaceName = argv[++i];
  else if (argv[i] === "--dry" || argv[i] === "-n") dry = true;
  else rest.push(argv[i]);
}

const question = rest.join(" ").trim();
if (!question) {
  console.error('Usage: npm run ask -- [--space <name>] [--dry] "your question"');
  process.exit(1);
}

seedIfEmpty();
const spaces = listSpaces();
const space = spaceName
  ? spaces.find((s) => s.name.toLowerCase() === spaceName.toLowerCase())
  : spaces[0];

if (!space) {
  console.error(
    `No space named "${spaceName}". Available: ${spaces.map((s) => s.name).join(", ")}`,
  );
  process.exit(1);
}

const compiled = compile(space, question);

console.log(`\nSpace: ${space.icon} ${space.name}`);
console.log("─".repeat(60));
console.log("You asked   :", question);
console.log("Will submit :");
for (const p of compiled.parts) console.log(`  [${p.label}] ${p.text}`);
if (compiled.filters.domainsAllow.length || compiled.filters.domainsDeny.length) {
  const allow = compiled.filters.domainsAllow.join(", ");
  const deny = compiled.filters.domainsDeny.map((d) => `-${d}`).join(", ");
  console.log(`  [filter] ${[allow, deny].filter(Boolean).join(", ")}`);
}
console.log("─".repeat(60));
for (const w of compiled.warnings) console.log("warning:", w);

// --dry exists so the compiled query can be checked without spending anything.
if (dry) {
  console.log("\n(dry run — nothing submitted)");
  process.exit(0);
}

try {
  const started = Date.now();
  const provider = await resolveProvider();
  const query = provider.appliesFiltersNatively
    ? compiled.text
    : foldFiltersIntoQuery(compiled.text, compiled.filters);

  const res = await provider.search({ query, filters: compiled.filters }, (stage) =>
    process.stdout.write(`\r  ${stage.padEnd(50)}`),
  );
  process.stdout.write("\r" + " ".repeat(56) + "\r");

  console.log(`\n${res.answerMarkdown}\n`);
  if (res.sources.length) {
    console.log("Sources:");
    for (const [i, s] of res.sources.slice(0, 12).entries()) {
      console.log(`  ${i + 1}. ${s.title || s.url}`);
      console.log(`     ${s.url}`);
    }
  }
  for (const w of res.warnings) console.log("warning:", w);
  if (res.threadUrl) console.log(`\nThread: ${res.threadUrl}`);

  const took = `${((Date.now() - started) / 1000).toFixed(1)}s`;
  if (res.usage) {
    const cost =
      typeof res.usage.costUsd === "number" ? `, $${res.usage.costUsd.toFixed(4)}` : "";
    console.log(
      `\n${res.usage.model} · ${res.usage.inputTokens + res.usage.outputTokens} tokens` +
        `${res.usage.searchQueries ? `, ${res.usage.searchQueries} searches` : ""}` +
        `${cost} · ${took}`,
    );
  } else {
    console.log(`\nTook ${took}`);
  }
} catch (err) {
  console.error("\nFailed:", (err as Error).message);
  process.exitCode = 1;
}

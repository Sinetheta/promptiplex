/**
 * Reads and rewrites spaces from the terminal.
 *
 *   npm run spaces                          # what you have, at a glance
 *   npm run spaces -- --json                # every field, for a reviewer to read
 *   npm run spaces -- apply plan.json       # apply a reviewed set of edits
 *   npm run spaces -- apply --dry plan.json # print what it would change
 *
 * Nothing here sends a query, needs a key, or touches the network. Editing a
 * space in the web UI does the same thing; this exists so a review can read
 * every space at once and hand back its rewrites as one file.
 *
 * The plan format is `src/lib/spacePlan.ts`.
 */
import fs from "node:fs";
import path from "node:path";
import { getSpace, listSpaces, updateSpace } from "../src/lib/db";
import { seedIfEmpty } from "../src/lib/seed";
import {
  applyEdit,
  describeEdit,
  label,
  parsePlan,
  rollbackFor,
  toInput,
  type SpaceChange,
} from "../src/lib/spacePlan";

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("-")));
const args = argv.filter((a) => !a.startsWith("-"));
const dry = flags.has("--dry") || flags.has("-n");

/** A declaration rather than an arrow, so `never` narrows the code after a call. */
function die(message: string): never {
  console.error(message);
  process.exit(1);
}

seedIfEmpty();

if (args[0] === "apply") {
  apply(args[1]);
} else if (args.length && args[0] !== "list") {
  die(`Unknown command "${args[0]}". Usage: npm run spaces -- [list|apply <plan.json>]`);
} else if (flags.has("--json")) {
  console.log(JSON.stringify({ spaces: listSpaces() }, null, 2));
} else {
  list();
}

/**
 * Roughly how many terminal columns a string takes up.
 *
 * Every space has an icon, and an emoji is drawn two columns wide while
 * counting as one character — so a table padded by character count comes out
 * ragged. The two rules here (emoji are wide, the variation selector after
 * them is not drawn) cover icons and ordinary names; this is not a full East
 * Asian width table, and does not pretend to be one.
 */
function columns(text: string): number {
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0xfe0f || cp === 0xfe0e || cp === 0x200d) continue;
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0x1f300 && cp <= 0x1faff) ||
      (cp >= 0x2600 && cp <= 0x27bf);
    n += wide ? 2 : 1;
  }
  return n;
}

function list(): void {
  const spaces = listSpaces();
  if (!spaces.length) return void console.log("No spaces yet.");

  const rows = spaces.map((s) => ({
    id: String(s.id),
    name: `${s.icon} ${s.name}`,
    brief: s.brief.trim() ? `${s.brief.length}` : "—",
    template: s.queryTemplate,
    sources:
      [...s.domainsAllow, ...s.domainsDeny.map((d) => `-${d}`)].join(", ") || "—",
  }));

  const width = (key: keyof (typeof rows)[number], head: string) =>
    Math.max(head.length, ...rows.map((r) => columns(r[key])));
  const pad = (text: string, to: number) => text + " ".repeat(Math.max(0, to - columns(text)));

  const w = {
    id: width("id", "id"),
    name: width("name", "space"),
    brief: width("brief", "brief"),
    template: Math.min(width("template", "template"), 34),
  };
  const clip = (text: string, to: number) =>
    [...text].length > to ? `${[...text].slice(0, to - 1).join("")}…` : text;

  console.log(
    `\n${pad("id", w.id)}  ${pad("space", w.name)}  ${pad("brief", w.brief)}  ` +
      `${pad("template", w.template)}  sources`,
  );
  console.log("─".repeat(w.id + w.name + w.brief + w.template + 15));
  for (const r of rows) {
    console.log(
      `${pad(r.id, w.id)}  ${pad(r.name, w.name)}  ${pad(r.brief, w.brief)}  ` +
        `${pad(clip(r.template, w.template), w.template)}  ${r.sources}`,
    );
  }
  console.log(
    `\n${spaces.length} space${spaces.length === 1 ? "" : "s"}. ` +
      `"brief" is its length in characters — every one of them is sent with the ` +
      `first question of a conversation.\n`,
  );
}

function apply(file: string | undefined): void {
  if (!file) die("Usage: npm run spaces -- apply <plan.json> [--dry]");

  let plan;
  try {
    plan = parsePlan(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch (err) {
    die((err as Error).message);
  }

  // Everything is checked before anything is written, so a plan whose fifth
  // edit is malformed does not leave the first four applied.
  const staged = plan.changes.map((change) => {
    const space = getSpace(change.id);
    if (!space) die(`No space with id ${change.id}. Run "npm run spaces" to see what is there.`);
    try {
      return { space, change, after: applyEdit(space, change) };
    } catch (err) {
      die((err as Error).message);
    }
  });

  const rollback: SpaceChange[] = [];

  for (const { space, change, after } of staged) {
    const moved = describeEdit(toInput(space), after);
    console.log(`\n${space.icon} ${space.name}  (id ${space.id})`);
    if (change.why) console.log(`  why: ${change.why}`);
    if (!moved.length) {
      console.log("  no change — the space already reads this way");
      continue;
    }

    for (const { field, before, after: next } of moved) {
      if (field === "brief") {
        const from = String(before).length;
        const to = String(next).length;
        console.log(`  brief: ${from} → ${to} characters`);
        for (const line of String(next).split("\n")) console.log(`    ${line}`);
      } else if (Array.isArray(next)) {
        const show = (v: unknown) => ((v as string[]).join(", ") || "—");
        console.log(`  ${label(field)}: ${show(before)} → ${show(next)}`);
      } else {
        console.log(`  ${label(field)}: ${JSON.stringify(before)} → ${JSON.stringify(next)}`);
      }
    }

    const undo = rollbackFor(space, after);
    if (undo) rollback.push(undo);
    if (!dry) updateSpace(space.id, after);
  }

  if (dry) {
    console.log("\n(dry run — nothing written)\n");
    return;
  }

  if (!rollback.length) {
    console.log("\nNothing to write; every space already read this way.\n");
    return;
  }

  const undoPath = `${file.replace(/\.json$/, "")}.rollback.json`;
  fs.writeFileSync(undoPath, `${JSON.stringify({ changes: rollback }, null, 2)}\n`);

  // A plan often lives outside the project, where a relative path is a stack of
  // "../" that nobody can read back.
  const shown = path.relative(process.cwd(), undoPath);
  console.log(
    `\nApplied ${rollback.length} change${rollback.length === 1 ? "" : "s"}.\n` +
      `Previous wording saved to ${shown.startsWith("..") ? path.resolve(undoPath) : shown} — ` +
      `apply that file to put it back.\n`,
  );
}

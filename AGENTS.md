<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
# Promptiplex

Perplexity search where a reusable context is compiled into the query **before**
it is submitted, so it is present while the search is being planned. Runs on the
Perplexity API.

## Keep opinions out of the repo

This is a public project. Everything committed should make sense to a stranger
who does not share the maintainer's setup, editor, workflow, or taste.

- **Committed files describe the project.** Facts about the code and decisions
  with reasons. No personal preferences, no notes to self, no conversation
  history.
- **`specs/` is gitignored and is where anything else goes** — plans, scratch
  scripts, transcripts, screenshots, working notes. Write freely there.
- **Personal tool config belongs in `*.local.*` files**, which are gitignored.
  Committed config should be the minimum a contributor needs, not a mirror of
  one machine.
- Before adding a section here, ask whether a stranger would need it. If it only
  matters to one person, it belongs in `specs/`.

## Tone: never disparage Perplexity

Perplexity is a service this project depends on and admires. Nothing committed
here — docs, comments, commit messages, UI copy — should read as criticism of
them, their engineering, or their choices.

Write about the *difference in ordering*, not about a defect:

- Say "instructions are applied after retrieval". Do not say bug, broken, wrong,
  too late, or nonsense.
- Do not speculate about their motives, costs, or internal reasoning. We do not
  know, and guessing publicly is both unfair and unwise.
- Their default is reasonable: for most questions the plain reading is the right
  one, and applying context after retrieval keeps queries fast and cheap. This
  project prefers a different trade-off for context-heavy questions. That is a
  preference, not a correction.
- Describe what this tool does, not what they should have done.

## What this does

Inside a Perplexity space, the space's instructions are applied when the answer
is composed, after sources have been retrieved. Promptiplex includes that same
context in the query text itself, so it is present a step earlier, while the
search is being planned.

Ask "how do I raise chickens?" inside a Minecraft space and the search may
reasonably go to real-world poultry keeping — that is the ordinary reading of
those words. Including the space context up front makes the intended reading
explicit from the start.

### Scope: a thin layer in front of the search

Perplexity does the substantial work — fanning out across sources, iterating,
and synthesising. This project reimplements none of that and should not drift
toward doing so. It changes one thing: *when* the context is applied.

**Spaces are stored by this app rather than by Perplexity.** Both orderings
cannot apply at once, so the context lives here, in the query Promptiplex
builds. The organisational side — naming, grouping, history — is ours to build,
simply because it has to live wherever the context lives.

**This may stop being necessary.** If Perplexity ever applies space instructions
before retrieval, the reason for this project largely goes away. That would be a
good outcome — do not build things that only make sense while the orderings
differ.

## Commands

```bash
npm run ask -- --dry "…"     # compile only, sends nothing, costs nothing
npm run ask -- "…"           # one real query from the terminal
npm run verify               # one small query end to end; confirms the key works
npm test                     # unit tests, no network, no key
npm run dev                  # web UI on :3000
npm run check                # typecheck + lint + test
```

`PERPLEXITY_API_KEY` is read from `.env`. `PROMPTIPLEX_MODEL` picks the Sonar
model (default `sonar`). `PROMPTIPLEX_PROVIDER_MODULE` swaps the provider
entirely.

## Architecture

Next.js App Router for the UI, SQLite for spaces and history.

```
src/lib/search/provider.ts  The SearchProvider interface. The seam.
src/lib/search/sonar.ts     Perplexity API: request shaping, response parsing.
src/lib/search/index.ts     Provider resolution, including PROMPTIPLEX_PROVIDER_MODULE.
src/lib/compile.ts          Space + question -> query + filters. Pure substitution.
src/lib/db.ts               SQLite schema and queries.
scripts/ask.mts             One query from the terminal.
scripts/verify.mts          Live health check. Costs one query.
tests/                      Pure-function tests. Must never touch the network.
```

`compile.ts` knows nothing about any provider's vocabulary, and
`search/sonar.ts` knows nothing about spaces. Keep it that way — the interface
between them is `CompiledQuery`.

## Non-negotiables

- **One request per user action.** No background polling, no speculative
  prefetching, no retry loops. Every request is billed to someone's key, so a
  failure is reported rather than quietly attempted again.
- **Tests must not hit the network or need a key.** The provider takes an
  injected `fetch`; use it. Anything requiring a live key belongs in
  `npm run verify`, which is run deliberately, not in CI.
- **No credentials in this codebase.** The key lives in `.env`, which is
  gitignored. Never log it, never commit it, never put it in an error message.
- **The server binds `127.0.0.1`.** `next dev` and `next start` default to
  `0.0.0.0`, so the `-H 127.0.0.1` in the `dev` and `start` scripts is the only
  thing keeping an unauthenticated, key-spending endpoint off the local
  network. Do not remove it, and do not add a deploy path that drops it.
- **This repo is public.** Everything committed is world-readable and stays in
  the history. Before writing a file, assume a stranger will read it: no keys,
  no absolute paths from one machine, no query history, no screenshots, no
  agent transcripts. Those go in `specs/`, which is gitignored.
- **Source preferences are a filter, not prose.** They are carried in
  `CompiledQuery.filters` and applied by the provider. Do not concatenate them
  into the query text for a provider that can apply them properly — that spends
  tokens re-asking for something already enforced.

## Things learned the hard way

- **`search_domain_filter` takes one flat list**, with exclusions written
  `-example.com`, and it is capped at 10 entries. `sonar.ts` truncates and warns
  rather than letting a space's eleventh domain fail the whole search.
- **Citations are already numbered in the answer text.** Sonar returns
  `[1]`, `[2]` inline, indexing into `search_results` **in order**. Sorting or
  deduplicating that array silently misnumbers every citation in the prose.
- `search_results` is the good source list — titles, snippets, dates. The older
  `citations` field is a bare URL array, and is only a fallback.
- **Cost comes back in `usage.cost.total_cost`.** Surfacing it per query is
  deliberate: it is the only signal a user gets that a change made searches more
  expensive.
- `PROMPTIPLEX_PROVIDER_MODULE` is imported by a specifier only known at
  runtime, so the `webpackIgnore`/`turbopackIgnore` comments in
  `search/index.ts` are load-bearing — without them the bundler tries to trace
  the path at build time.

## Known limitations

- **History is local and unsynced.** `promptiplex.db` is a plain SQLite file
  next to the project. There is no export yet.
- `remoteUuid` / `remoteSlug` on a space are provenance fields for spaces that
  were created elsewhere and copied in. Nothing in this repo populates them; they
  exist so an importer can, without creating duplicates.

## Planned

1. **LLM-combined queries** — instead of template substitution, one cheap call
   that merges brief and question, then the real search.
2. **A local model for that combine step**, so it costs nothing.
3. Per-space model and search-mode selection, which would make
   `search_mode: "academic"` genuinely useful for the Papers space.

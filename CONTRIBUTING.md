# Contributing

## Getting set up

```bash
npm install
cp .env.example .env    # add a key from https://www.perplexity.ai/account/api/group
npm run check           # typecheck + lint + tests — needs no key
```

Node 22 or newer (`.nvmrc` pins it; CI uses the same).

You only need a key to run `npm run ask` or `npm run verify`. Everything in
`npm run check` runs without one, so you can contribute to most of this project
without spending anything.

## Keep opinions out of the repo

Committed files should make sense to someone who does not share your setup,
editor, workflow, or taste.

- **`specs/` is gitignored** — put plans, notes, scratch scripts, transcripts,
  and screenshots there. Write whatever you like; none of it is published.
- **`local/` is gitignored** — a search provider of your own goes there.
- **Personal tool config goes in `*.local.*` files**, also gitignored. Commit
  only the minimum a contributor actually needs.
- If a note is a fact about *the project* rather than about how you work, move it
  into `AGENTS.md`, rewritten so a stranger would understand it.

## Spending other people's money

Every real query is billed to whoever owns the key. That shapes the rules here
more than anything else:

- **One request per user action.** No background polling, no prefetching, no
  retry loops. If a search fails, report it and stop.
- **Surface the cost.** `usage.cost.total_cost` comes back on every response and
  is shown per query. Do not drop it on the floor.
- **Prefer `--dry`.** `npm run ask -- --dry "…"` compiles and prints the query
  without sending it, which is free and answers most questions about behaviour.
- `npm run verify` is the only command in the repo that deliberately costs
  money, and it sends exactly one small query.

## Working on the provider

Searching sits behind `SearchProvider` in `src/lib/search/provider.ts`.

- `compile.ts` must not learn any provider's vocabulary, and `sonar.ts` must not
  learn about spaces. `CompiledQuery` is the interface between them.
- Source preferences live in `CompiledQuery.filters`, not in the query text. A
  provider that can apply them natively should; one that cannot calls
  `foldFiltersIntoQuery`.
- To try a different backend, default-export a `SearchProvider` from a module
  and point `PROMPTIPLEX_PROVIDER_MODULE` at it. See the README.

## Tests

`npm test` runs `node --test` over `tests/`. Tests must be pure: no network, no
key, no live session. `createSonarProvider` takes a `fetchImpl`, so provider
behaviour is tested against canned responses — including the failure paths,
which are the ones you cannot afford to exercise for real.

Anything genuinely needing a live key is covered by `npm run verify`, which a
human runs deliberately.

The valuable tests here are the ones covering things that would be expensive or
silent to get wrong — citation ordering, domain-filter shaping, query assembly.
Add to that set.

## Commits and pull requests

- Work on a branch off `main`.
- Explain *why* in the commit body when the reason is not obvious from the diff.
- Run `npm run check` before pushing. CI runs the same thing.
- Do not commit `promptiplex.db`, `.env`, or anything from `specs/` or `local/`.

CodeRabbit reviews pull requests automatically; `.coderabbit.yaml` holds its
configuration, including the per-path rules that mirror the constraints above.
Its reviews are rate-limited, so a branch is pushed once the work is finished
rather than a piece at a time. Agents working in this repo follow the same
loop — see "Branches and review" in [AGENTS.md](AGENTS.md).

## This repo is public

Anything pushed here is world-readable and stays in the history, so a mistake
is not undone by deleting the file later.

- **Never paste a key** into an issue, a pull request, a comment, a log excerpt,
  or a test fixture. If one is exposed, revoke it at
  <https://www.perplexity.ai/account/api/group> before anything else.
- **Redact before attaching.** Terminal output, screenshots, and query history
  carry keys and private questions. Trim them to what the report needs.
- The `dev` and `start` scripts bind `127.0.0.1` deliberately — see
  [SECURITY.md](SECURITY.md) before changing how the server listens.

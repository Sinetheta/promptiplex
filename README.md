# Promptiplex

A small front end for Perplexity that puts your standing context **into the
query**, so it is there while the search is being planned rather than applied
once the answer is composed.

> Unofficial personal project. Not affiliated with, endorsed by, or connected to
> Perplexity AI. Perplexity does the real work here — searching, gathering, and
> synthesising. This is a thin layer in front of it.

## Why

A Perplexity space applies its instructions when the answer is composed, after
sources have been gathered. That is a sensible default: for most questions the
plain reading of the words is the right one, and it keeps queries quick.

Some questions are not like that. Asked inside a Minecraft space:

> **You ask:** How do I raise chickens?
> **A reasonable search:** how people raise chickens on farms

Nothing has gone awry there — that is what those words ordinarily mean. It just
is not what I meant, and the sources have been chosen by the time the space
context comes into play.

Promptiplex assembles the context into the query first, then submits that:

```
Context: I play Minecraft Java Edition 1.21 in survival mode, single
player, no mods. Every question is about in-game mechanics, never about
the real world. Give exact game values: tick counts, drop rates…

Minecraft Java Edition 1.21 survival: How do I raise chickens?
```

One query, with the context present from the start — plus `minecraft.wiki` as a
source filter the search applies itself.

## Setup

```bash
npm install
cp .env.example .env      # then add your key
```

Get a key from [your Perplexity API
settings](https://www.perplexity.ai/account/api/group). The API is pay-as-you-go
and billed separately from a Perplexity subscription.

```bash
npm run ask -- --dry "how do I raise chickens?"   # compile only, sends nothing
npm run verify                                     # one small query, end to end
npm run ask -- "how do I raise chickens?"          # terminal
npm run dev                                        # web UI on :3000
```

Requires Node 22+. Tested on macOS.

Port 3000 is a popular default, so it is often already taken. Set `PORT` in
`.env` to move `npm run dev` and `npm start` somewhere quieter, or pass it for
one run:

```bash
PORT=4173 npm run dev
```

The shell wins over `.env`, and `.env` wins over the default. The hostname is
deliberately not configurable — see below.

## Running it safely

This is a single-user tool that runs on your own machine, holding a key that
bills you per query. It has no accounts, no login, and no rate limiting —
anything that can reach the server can spend your key.

- **It binds to `127.0.0.1`.** `npm run dev` and `npm start` pass
  `-H 127.0.0.1`, so the server answers only on this machine. Next's own
  default is `0.0.0.0`, which would also answer anyone on the same network.
  Change that only if you know who else is on it.
- **Do not deploy it to a public URL as it stands.** An open endpoint that
  spends a metered key will be found and used. Put it behind real
  authentication first.
- **`.env` and `promptiplex.db` are gitignored, and must stay that way.** The
  key lives in `.env`; every question, answer, and cost lives unencrypted in
  `promptiplex.db`.
- **A custom provider module runs with your full privileges.**
  `PROMPTIPLEX_PROVIDER_MODULE` is imported and executed by this process, so
  point it only at code you have read.
- Screenshots and terminal transcripts often contain the key or private
  questions. `specs/` is gitignored for exactly that reason — keep them there.

Found a security problem? See [SECURITY.md](SECURITY.md).

## What a query costs

Every search reports its own price. `npm run ask` prints a summary line, the web
UI shows it under each answer, and both are stored in history:

```
sonar · 1,284 tokens, 3 searches, $0.0061 · 4.2s
```

Promptiplex sends **one request per action**. No background polling, no
speculative prefetching, and a failed search is reported rather than quietly
retried — a retry loop on a metered key is a bill, not a convenience. `--dry`
compiles and prints the query without sending it, which is free.

Set `PROMPTIPLEX_MODEL` to change models (`sonar`, `sonar-pro`,
`sonar-reasoning-pro`, `sonar-deep-research`). The default is `sonar`, the
cheapest.

## Spaces

A space is your standing context, stored locally in `promptiplex.db`:

| Field | What it does |
|---|---|
| **Brief** | Prefixed to every query as `Context: …` |
| **Query template** | `{q}` is replaced with your question |
| **Prefer / avoid sources** | Sent as a domain filter, not as query text |

Three are seeded on first run: **Minecraft**, **Papers**, **Plain search**.

Source preferences are kept out of the query text on purpose. They travel as
`search_domain_filter`, so the search is constrained rather than asked — and the
tokens go to your actual question.

## Conversations

Questions asked in a space are kept together as a conversation, and a follow-up
continues the one you are reading rather than starting again.

The brief is compiled into the **first** question of a conversation and not into
the ones after it. Sonar's endpoint is a chat completion, so a follow-up is sent
as the exchange so far plus the new question — the first message already carries
the brief, and restating it every turn would spend tokens re-establishing
context that is right there in the request.

Each turn can show the exact text that was sent, so what the brief did and did
not add to it stays visible.

Source preferences are not context, so they are applied to every turn.

A conversation is one request per question, exactly like a standalone search.
The turns sent with a follow-up are input tokens, so a long conversation costs
more per question than a short one — the per-answer cost line shows this
happening.

## Providers

Searching sits behind one interface, `SearchProvider` in
`src/lib/search/provider.ts`. The shipped implementation is `sonar`.

To use something else, point `PROMPTIPLEX_PROVIDER_MODULE` at a module whose
default export is a `SearchProvider` (or a function returning one):

```ts
// local/my-provider.ts
import type { SearchProvider } from "@/lib/search";

const provider: SearchProvider = {
  id: "mine",
  label: "My provider",
  appliesFiltersNatively: false,
  async search({ query }) {
    return { answerMarkdown: "…", sources: [], images: [], warnings: [] };
  },
  // Optional. Without it, the UI offers a new search instead of a follow-up.
  async followUp({ question, turns }) {
    return { answerMarkdown: "…", sources: [], images: [], warnings: [] };
  },
};
export default provider;
```

```bash
PROMPTIPLEX_PROVIDER_MODULE=./local/my-provider.ts npm run ask -- "…"
```

`local/` is gitignored, so a provider kept there stays out of the repo. With
`appliesFiltersNatively: false`, Promptiplex folds the space's source
preferences into the query text instead, as a plain-language request.

## Development

```bash
npm run check     # typecheck + lint + tests
npm test          # unit tests — no network, no key required
npm run verify    # one real query against your key
```

Tests are pure: query assembly, request shaping, response parsing, and the
database. The provider is exercised through an injected `fetch`, so the suite
never spends anything and CI needs no key. `npm run verify` is the only thing
that issues a real request, and a human runs it deliberately.

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Planned

- One cheap query to merge brief and question intelligently, then the real
  search — instead of template substitution.
- A local LLM for that merge step, so it costs nothing.

## License

MIT — see [LICENSE](LICENSE).

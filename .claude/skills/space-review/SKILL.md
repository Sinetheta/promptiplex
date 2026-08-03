---
name: space-review
description: "Read every space in the local Promptiplex database and review it as search input — how many spaces there are, whether they overlap, and whether each brief is written to steer a search or only to shape an answer. Proposes rewritten briefs, templates, and source filters, and applies them once approved. Housekeeping, run occasionally, not per query. Trigger phrases: 'review my spaces', 'are my briefs any good', 'clean up my spaces', 'tidy the spaces', 'why is this space giving me bad results', 'rewrite my briefs'."
---

# /space-review

Housekeeping for the spaces in `promptiplex.db`. It reads them, judges the
wording, and proposes rewrites.

Nothing here sends a query, spends the key, or touches the network — the whole
review is reading and thinking. It is a judgement task, so run it with the
strongest model available, and run it occasionally rather than often.

## What is actually being reviewed

A brief and a template are compiled into the query text and submitted, so those
words are present while the search is being planned and still present when the
answer is composed. One piece of text doing two jobs.

Most briefs were written for the second job only. In a Perplexity space the
instructions are applied when the answer is composed, after sources have been
gathered — a reasonable default, and a brief written for it reads like a note to
the assistant: who to be, how long to answer, what tone to take. Here that same
text is also the first thing a search sees. This review asks what those words do
to the search.

Two facts to hold while reading:

- **Name and icon are never sent.** They exist so a human can pick the right
  space. Only the brief, the template, and the source filters reach the
  provider.
- **The brief and template land on the opening question of a conversation
  only.** Follow-ups carry the earlier turns instead, so the brief is said once
  and has to survive being said once. See `compileFollowUp` in
  `src/lib/compile.ts`.

## Read everything first

```bash
npm run spaces            # the shape of the collection
npm run spaces -- --json  # every field of every space
```

Read all of it before judging any of it. Half of what is wrong with a set of
spaces is only visible across them.

This review reads the spaces and nothing else. Query history is deliberately not
consulted: correlating wording with answer quality needs many more queries than
a personal database holds, and guessing from a handful would be worse than
reading the words carefully. That is a later, larger thing.

## Pass one — the collection

- **Which space would you pick?** Take a few questions the user plausibly asks
  and choose a space for each. Any question with two plausible homes is the
  finding: either the two spaces merge, or each brief has to say what it is for
  and what it is not.
- **A general space swallowing a specific one.** If a broad space would answer
  the narrow one's questions acceptably, the narrow one has to earn its place —
  usually by pinning a version, a platform, or a source the broad one cannot.
- **A space nobody would choose.** Written once, never the right answer.
- **Two subjects in one brief** is a space asking to be split.
- **An empty brief can be right.** A plain search space with no context is a
  deliberate escape hatch, not an oversight.

Recommend merges, splits, and deletions in the report. Never delete a space
yourself — deleting is done by the user in the web UI, and it is the one action
here that loses something.

## Pass two — the words in each space

Judge each brief against what it does to a search.

1. **Name the subject the way sources name it.** "Oxygen Not Included", not
   "the game". "Bambu Lab P2S", not "my printer". Retrieval works on the words;
   the exact name is the single highest-value thing in a brief.
2. **Identifying words first.** The opening sentence does the most work. Subject,
   version, platform, edition, jurisdiction, locale — whatever pins the reading
   of an ambiguous question goes at the front.
3. **Persona framing is answer-shaping, and it is also search text.** "You are a
   certified diabetes educator" tells the composing model something useful, but
   in a query those words also describe a profession that has pages written
   about it. Prefer naming the subject and the standard: what the answer should
   be checked against, in the vocabulary the sources use.
4. **Negations are weak in a query.** "no mods", "no Raspberry Pi setup", "never
   about the real world" — the excluded words are still in the text and can pull
   toward the thing being excluded. Where the exclusion is about *sources*, move
   it to the avoid list, which is a real constraint. Where it is about subject,
   state the positive instead.
5. **Standing context only.** A brief is what is true every time. Anything true
   of one question belongs in that question.
6. **Stale references.** Briefs accumulate promises about things that are not
   here — a document that will be pasted, a previous conversation, a file
   attachment. There are no attachments in this app. Cut them or turn them into
   the fact they were standing in for.
7. **Formatting and tone instructions still work** — the composing model reads
   the whole query — but they do nothing for retrieval. Keep the ones that
   change an answer the user would act on, put them after the identifying words,
   and be honest about the ones that are just habit.
8. **Never trim a safety instruction to save tokens.** Verification against
   current guidance, disclaimers, warning signs, "flag anything needing a
   professional" — in a medical, legal, financial, or otherwise consequential
   space those lines are the point. If they can be tightened, tighten the
   wording, not the coverage, and say so plainly in the report.
9. **Length is a bill on every conversation.** Every character rides along with
   the opening question. Most spaces say what they need in 400–800 characters;
   past about 1500, go sentence by sentence and ask what each one buys. The
   compiler warns at 6000.
10. **The template is not a second brief.** It is a short prefix that pins the
    subject onto the question itself — `Minecraft Java Edition 1.21 survival:
    {q}`. If the same words are in both, one of them is waste. A template
    without `{q}` is a defect; the question gets appended and the compiler warns.
11. **Source preferences belong in the filters, not the prose.** "Prefer the
    wiki" in a brief is a request the search may weigh. The same domain in the
    prefer list is applied as a constraint and costs no tokens. Two cautions:
    the provider caps the combined list at 10 domains, and a filter that is too
    tight starves a question that needed the wider web.

### Do not guess

Some spaces are named for something only the user knows — an acronym, a
household system, a project. If you cannot tell what a space is for from its
brief, ask. A confident rewrite of a subject you have misread is worse than the
half-written brief it replaced, because it reads as deliberate.

The same goes for domains: only propose a filter for a site you are sure exists
and is the right one. A wrong domain filter does not degrade a search, it
strangles it.

## Write the report

Write to `specs/space-review-YYYY-MM-DD.md`. `specs/` is gitignored, and briefs
are the user's private context — they do not go anywhere else in the repo, and
they do not go in a commit message.

For each space: what it is for, what the wording is doing to the search, and the
proposed replacement in full. Show the old and the new. Findings about the
collection go at the top, since they can change what the individual rewrites
should say.

The report is the deliverable. The plan below is just the report made
applicable.

## Propose, then apply

Write the edits as a plan next to the report, `specs/space-review-YYYY-MM-DD.plan.json`:

```json
{
  "changes": [
    {
      "id": 4,
      "expect": "ONI",
      "why": "Names the game as sources name it; moves the wiki into a real filter.",
      "set": {
        "brief": "Oxygen Not Included, base game…",
        "queryTemplate": "Oxygen Not Included: {q}",
        "domainsAllow": ["oxygennotincluded.fandom.com"]
      }
    }
  ]
}
```

`id` and `expect` identify the space — `expect` is its name as you read it, so a
plan that has gone stale refuses rather than overwriting something else. `set`
carries only the fields that change; anything absent is left alone. Field names
are the ones in `npm run spaces -- --json`.

```bash
npm run spaces -- apply --dry specs/space-review-2026-08-03.plan.json   # prints what would change
npm run spaces -- apply specs/space-review-2026-08-03.plan.json         # writes it
```

- **Show the dry run and wait for a yes.** These are the user's words, written
  over a long time. Applying them unasked is the one way this skill can do
  damage.
- **One plan for everything**, so the user reads and decides once.
- Applying writes `…plan.rollback.json` beside the plan. Applying *that* puts the
  previous wording back. Tell the user it is there.
- Renaming a space is free at query time and only changes which space a human
  picks, so propose it when the name is what is confusing, and let the brief
  carry the meaning either way.

## After

Nothing is verified by this review. It is a careful reading, not a measurement —
the words are better argued for, which is not the same as knowing they retrieve
better. Say so when handing it back, and leave the user to notice the difference
in their own questions.

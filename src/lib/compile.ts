import type { CompiledQuery, Space } from "./types";

/**
 * Turns a Space plus a raw question into the single query that gets submitted.
 *
 * The point of the whole project is in the ordering: the standing context is
 * part of the query text, so it is present while the search is being planned
 * rather than applied to sources that have already been chosen.
 *
 * Source preferences are kept *out* of the text and returned as `filters`, so a
 * provider can apply them as real constraints. Providers that cannot fold them
 * back into the text — see `foldFiltersIntoQuery` in `search/provider.ts`.
 *
 * Assembly is pure string substitution. No model is involved.
 */

function cleanDomain(raw: string): string {
  return raw
    .trim()
    .replace(/^-/, "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .trim();
}

export function compile(space: Space, question: string): CompiledQuery {
  const warnings: string[] = [];
  const parts: CompiledQuery["parts"] = [];
  const q = question.trim();

  const brief = space.brief.trim();
  if (brief) parts.push({ label: "brief", text: `Context: ${brief}` });

  const template = space.queryTemplate?.trim() || "{q}";
  if (!template.includes("{q}")) {
    warnings.push("Template has no {q} placeholder, so the question was appended to the end.");
  }
  const asked = template.includes("{q}")
    ? template.replaceAll("{q}", q)
    : `${template} ${q}`.trim();
  parts.push({ label: "question", text: asked });

  const filters = {
    domainsAllow: space.domainsAllow.map(cleanDomain).filter(Boolean),
    domainsDeny: space.domainsDeny.map(cleanDomain).filter(Boolean),
  };

  const text = parts.map((p) => p.text).join("\n\n");

  // A brief past this size starts crowding out the actual question while the
  // search is being planned. Real spaces run to ~4k characters, so the
  // threshold sits above that to avoid warning about ordinary data.
  if (text.length > 6000) {
    warnings.push(`Compiled query is ${text.length} characters; consider shortening the brief.`);
  }
  if (!q) warnings.push("The question is empty.");

  return { text, parts, warnings, filters };
}

/**
 * The same assembly for a question asked inside an existing conversation.
 *
 * The brief is deliberately left out. It was compiled into the first question
 * of the conversation, and that exchange is sent along with this one, so the
 * context is already there — restating it every turn would spend tokens
 * re-establishing what has already been established. The Space's template is
 * skipped for the same reason: it framed the opening question, and a follow-up
 * is read against that frame rather than starting a new one.
 *
 * Source preferences are not context, so they still travel as `filters` and are
 * applied to every turn.
 */
export function compileFollowUp(space: Space, question: string): CompiledQuery {
  const warnings: string[] = [];
  const q = question.trim();
  if (!q) warnings.push("The question is empty.");

  return {
    text: q,
    parts: [{ label: "follow-up", text: q }],
    warnings,
    filters: {
      domainsAllow: space.domainsAllow.map(cleanDomain).filter(Boolean),
      domainsDeny: space.domainsDeny.map(cleanDomain).filter(Boolean),
    },
  };
}

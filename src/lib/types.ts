import { z } from "zod";

/**
 * A Space is a reusable research context that is compiled into the query text
 * *before* it is submitted, so it steers what Perplexity retrieves rather than
 * being applied to results it has already picked.
 */

export const spaceInputSchema = z.object({
  name: z.string().min(1).max(80),
  icon: z.string().max(8).default("🔎"),

  /** Standing context. Becomes the "Context:" prefix of the compiled query. */
  brief: z.string().max(8000).default(""),

  /** `{q}` is replaced with the raw question; if absent, the question is appended. */
  queryTemplate: z.string().max(2000).default("{q}"),

  domainsAllow: z.array(z.string()).max(20).default([]),
  domainsDeny: z.array(z.string()).max(20).default([]),

  /**
   * Provenance for a space that was imported from a Perplexity account once.
   * `remoteUuid` exists so a re-run of the importer does not create duplicates;
   * `remoteSlug` lets a user find the original. Neither implies a live link —
   * after import the local copy is authoritative. See AGENTS.md.
   */
  remoteUuid: z.string().default(""),
  remoteSlug: z.string().default(""),
});

export type SpaceInput = z.infer<typeof spaceInputSchema>;
export type Space = SpaceInput & {
  id: number;
  createdAt: string;
  updatedAt: string;
};

/** The exact query that will be sent, plus how it was built. */
export type CompiledQuery = {
  text: string;
  /** The pieces that were concatenated, so the UI can show what came from where. */
  parts: { label: string; text: string }[];
  warnings: string[];

  /**
   * Constraints kept out of `text` so a provider can apply them natively.
   * Providers that cannot fold them back into the query as prose — see
   * `foldFiltersIntoQuery` in `search/provider.ts`.
   */
  filters: QueryFilters;
};

export type QueryFilters = {
  domainsAllow: string[];
  domainsDeny: string[];
};

export type Source = {
  title: string;
  url: string;
  snippet?: string;
  date?: string;
};

export type ResultImage = {
  image_url: string;
  origin_url?: string;
  title?: string;
};

/** What one search cost, so the bill is visible where the query is. */
export type SearchUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  searchQueries: number;
  /** Provider-reported cost in USD. Absent when the provider does not say. */
  costUsd?: number;
};

export type QueryResult = {
  answer: string;
  sources: Source[];
  images: ResultImage[];
  /** Which provider answered, e.g. "sonar". */
  provider?: string;
  /** A link to the search on the provider's site, when there is one. */
  threadUrl?: string;
  usage?: SearchUsage;
};

export type QueryRecord = {
  id: number;
  spaceId: number | null;
  spaceName: string | null;
  spaceIcon: string | null;
  conversationId: number | null;
  /** 1-based position within the conversation. */
  turn: number;
  question: string;
  compiled: CompiledQuery;
  result: QueryResult | null;
  error: string | null;
  durationMs: number;
  createdAt: string;
};

/**
 * A run of questions asked against one Space, in order.
 *
 * The first question is compiled with the Space's brief in front of it. Later
 * questions are not: the earlier turns are sent with them, so the context is
 * already in the exchange and repeating it would only spend tokens restating
 * what the provider can already see.
 */
export type Conversation = {
  id: number;
  spaceId: number | null;
  spaceName: string | null;
  spaceIcon: string | null;
  title: string;
  /**
   * Where the provider keeps this exchange, when it keeps one of its own.
   * Empty for providers that are stateless between requests, which is the
   * usual case — those are continued by resending the turns.
   */
  threadUrl: string;
  provider: string;
  turnCount: number;
  createdAt: string;
  updatedAt: string;
};

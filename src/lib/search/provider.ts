import type { CompiledQuery, ResultImage, SearchUsage, Source } from "../types";

/**
 * The contract between Promptiplex and whatever actually performs a search.
 *
 * Promptiplex's own job is small: assemble a Space's standing context and a question
 * into one query, hand it to a provider, and record what came back. Everything
 * substantial — fanning out across sources, iterating, synthesising — belongs
 * to the provider. Keeping that behind an interface makes the boundary explicit
 * and keeps `compile.ts` free of any provider's vocabulary.
 *
 * The shipped provider is `sonar`, which calls Perplexity's Sonar API. Others
 * can be supplied at runtime; see `resolveProvider` in `./index.ts`.
 */

export type ProviderProgress = (stage: string) => void;

export type SearchRequest = {
  /** The compiled query text. Already includes the brief and the question. */
  query: string;

  /**
   * Structured constraints from the Space. A provider that can apply these
   * natively should do so; one that cannot should call `foldFiltersIntoQuery`
   * and state them in the query text instead.
   */
  filters: CompiledQuery["filters"];

  signal?: AbortSignal;
};

export type SearchAnswer = {
  answerMarkdown: string;
  sources: Source[];
  images: ResultImage[];

  /** Anything worth surfacing that did not stop the search from succeeding. */
  warnings: string[];

  /** A link to the search on the provider's own site, when there is one. */
  threadUrl?: string;

  usage?: SearchUsage;
};

export interface SearchProvider {
  /** Stable identifier, e.g. "sonar". Recorded with each query. */
  readonly id: string;

  /** Human-readable name for the UI. */
  readonly label: string;

  /**
   * True when the provider applies `filters` as real constraints. False means
   * the caller should fold them into the query text as a plain-language
   * request, which a search engine may weigh but is not bound by.
   */
  readonly appliesFiltersNatively: boolean;

  search(req: SearchRequest, onProgress?: ProviderProgress): Promise<SearchAnswer>;
}

/**
 * Restates structured filters as a sentence appended to the query, for
 * providers that have no native equivalent. This is a request, not a
 * constraint: the search may still return other domains.
 */
export function foldFiltersIntoQuery(query: string, filters: CompiledQuery["filters"]): string {
  const asked: string[] = [];
  if (filters.domainsAllow.length) {
    asked.push(`Prefer sources from ${filters.domainsAllow.join(", ")}.`);
  }
  if (filters.domainsDeny.length) {
    asked.push(`Do not use ${filters.domainsDeny.join(", ")}.`);
  }
  return asked.length ? `${query}\n\n${asked.join(" ")}` : query;
}

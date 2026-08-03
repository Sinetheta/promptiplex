import type { ResultImage, SearchUsage, Source } from "../types";
import type {
  FollowUpRequest,
  ProviderProgress,
  SearchAnswer,
  SearchProvider,
  SearchRequest,
} from "./provider";

/**
 * Perplexity's Sonar API.
 *
 * The whole reason Promptiplex exists is ordering: a Space's standing context belongs
 * in the query while the search is being planned, not applied to sources that
 * have already been chosen. The API makes that straightforward — the request
 * body *is* the query, so there is nothing to arrange around.
 *
 * It also turns the Space's source preferences into real constraints.
 * `search_domain_filter` is applied by the search itself rather than being a
 * request stated in prose, so `appliesFiltersNatively` is true here.
 */

const ENDPOINT = "https://api.perplexity.ai/chat/completions";

/** Models that accept the search parameters used below. */
export const SONAR_MODELS = [
  "sonar",
  "sonar-pro",
  "sonar-reasoning-pro",
  "sonar-deep-research",
] as const;

export type SonarModel = (typeof SONAR_MODELS)[number];

/**
 * The API rejects a domain filter longer than this. Extra entries are dropped
 * with a warning rather than failing the search over a Space's tenth domain.
 */
const MAX_DOMAIN_FILTER = 10;

export type SonarOptions = {
  apiKey: string;
  model?: SonarModel | string;
  endpoint?: string;
  /** Injected by tests so the suite never touches the network. */
  fetchImpl?: typeof fetch;
  /** Guards against a hung request holding a terminal open. */
  timeoutMs?: number;
};

type SonarResponse = {
  choices?: { message?: { content?: string | null } }[];
  citations?: string[];
  search_results?: {
    title?: string;
    url?: string;
    snippet?: string;
    date?: string;
  }[];
  images?: { image_url?: string; origin_url?: string; title?: string }[];
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    num_search_queries?: number;
    cost?: { total_cost?: number };
  };
};

/**
 * Sonar takes one flat list where an excluded domain is written `-example.com`,
 * so allow and deny merge into a single array here.
 */
function buildDomainFilter(
  allow: string[],
  deny: string[],
  warnings: string[],
): string[] | undefined {
  const merged = [...allow, ...deny.map((d) => `-${d}`)];
  if (!merged.length) return undefined;
  if (merged.length > MAX_DOMAIN_FILTER) {
    warnings.push(
      `Sonar accepts ${MAX_DOMAIN_FILTER} domains per search; ` +
        `${merged.length - MAX_DOMAIN_FILTER} were dropped from this Space's list.`,
    );
  }
  return merged.slice(0, MAX_DOMAIN_FILTER);
}

/** Exported so tests can assert the wire format without issuing a request. */
export function buildRequestBody(
  req: SearchRequest,
  model: string,
  warnings: string[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content: req.query }],
    return_images: true,
  };

  const domains = buildDomainFilter(req.filters.domainsAllow, req.filters.domainsDeny, warnings);
  if (domains) body.search_domain_filter = domains;

  return body;
}

/**
 * The same request, with the exchange so far in front of the new question.
 *
 * Sonar's endpoint is a chat completion, so continuing a conversation is just a
 * longer `messages` array — the first user message is the compiled query, brief
 * included, which is why later questions are sent as they were typed.
 *
 * Exported so tests can assert the wire format without issuing a request.
 */
export function buildFollowUpBody(
  req: FollowUpRequest,
  model: string,
  warnings: string[],
): Record<string, unknown> {
  const messages = req.turns.flatMap((t) => [
    { role: "user", content: t.question },
    { role: "assistant", content: t.answerMarkdown },
  ]);
  messages.push({ role: "user", content: req.question });

  const body: Record<string, unknown> = { model, messages, return_images: true };

  const domains = buildDomainFilter(req.filters.domainsAllow, req.filters.domainsDeny, warnings);
  if (domains) body.search_domain_filter = domains;

  return body;
}

/**
 * `search_results` carries titles and snippets; `citations` is a bare URL list
 * kept for older responses. The answer text numbers its citations `[1]`, `[2]`
 * against this order, so the order must be preserved exactly.
 */
export function parseSources(res: SonarResponse): Source[] {
  if (Array.isArray(res.search_results) && res.search_results.length) {
    return res.search_results
      .filter((r) => r.url)
      .map((r) => ({
        title: r.title?.trim() || hostOf(r.url!),
        url: r.url!,
        ...(r.snippet ? { snippet: r.snippet } : {}),
        ...(r.date ? { date: r.date } : {}),
      }));
  }
  return (res.citations ?? []).filter(Boolean).map((url) => ({ title: hostOf(url), url }));
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function parseUsage(res: SonarResponse, fallbackModel: string): SearchUsage {
  const u = res.usage ?? {};
  return {
    model: res.model || fallbackModel,
    inputTokens: u.prompt_tokens ?? 0,
    outputTokens: u.completion_tokens ?? 0,
    searchQueries: u.num_search_queries ?? 0,
    ...(typeof u.cost?.total_cost === "number" ? { costUsd: u.cost.total_cost } : {}),
  };
}

export function parseImages(res: SonarResponse): ResultImage[] {
  return (res.images ?? [])
    .filter((i) => i.image_url)
    .map((i) => ({
      image_url: i.image_url!,
      ...(i.origin_url ? { origin_url: i.origin_url } : {}),
      ...(i.title ? { title: i.title } : {}),
    }));
}

/** Turns a failed response into a message that says what to actually do. */
function describeFailure(status: number, bodyText: string): string {
  const detail = bodyText.slice(0, 300).trim();
  if (status === 401 || status === 403) {
    return (
      "Perplexity rejected the API key. Check PERPLEXITY_API_KEY in .env — " +
      "keys are issued at https://www.perplexity.ai/account/api/group."
    );
  }
  if (status === 429) {
    return "Perplexity is rate limiting this key. Wait a moment before asking again.";
  }
  if (status === 402) {
    return "This Perplexity API key has no credit remaining.";
  }
  return `Perplexity API returned ${status}${detail ? `: ${detail}` : ""}`;
}

export function createSonarProvider(opts: SonarOptions): SearchProvider {
  const model = opts.model || "sonar";
  const endpoint = opts.endpoint || ENDPOINT;
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 120_000;

  /**
   * One request per action — no retries. A failed call is reported, not
   * silently attempted again on someone's metered key.
   */
  async function send(
    body: Record<string, unknown>,
    warnings: string[],
    reqSignal: AbortSignal | undefined,
    onProgress?: ProviderProgress,
  ): Promise<SearchAnswer> {
    onProgress?.(`asking ${model}`);

    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = reqSignal ? AbortSignal.any([reqSignal, timeout]) : timeout;

    let res: Response;
    try {
      res = await doFetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      const { name, message } = err as Error;
      if (name === "TimeoutError") {
        throw new Error(`Perplexity did not respond within ${timeoutMs / 1000}s.`);
      }
      // The caller stopped it. Nothing was unreachable, and saying so sends
      // whoever reads it off checking a network that was fine.
      if (name === "AbortError") {
        throw new Error("The search was cancelled before Perplexity replied.");
      }
      throw new Error(`Could not reach the Perplexity API: ${message}`);
    }

    if (!res.ok) {
      throw new Error(describeFailure(res.status, await res.text().catch(() => "")));
    }

    onProgress?.("reading answer");
    const json = (await res.json()) as SonarResponse;
    const answerMarkdown = (json.choices?.[0]?.message?.content ?? "").trim();
    if (!answerMarkdown) {
      throw new Error("Perplexity returned an empty answer.");
    }

    return {
      answerMarkdown,
      sources: parseSources(json),
      images: parseImages(json),
      warnings,
      usage: parseUsage(json, model),
    };
  }

  return {
    id: "sonar",
    label: `Perplexity Sonar (${model})`,
    appliesFiltersNatively: true,

    async search(req: SearchRequest, onProgress?: ProviderProgress): Promise<SearchAnswer> {
      const warnings: string[] = [];
      return send(buildRequestBody(req, model, warnings), warnings, req.signal, onProgress);
    },

    async followUp(req: FollowUpRequest, onProgress?: ProviderProgress): Promise<SearchAnswer> {
      const warnings: string[] = [];
      return send(buildFollowUpBody(req, model, warnings), warnings, req.signal, onProgress);
    },
  };
}

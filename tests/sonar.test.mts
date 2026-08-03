import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFollowUpBody,
  buildRequestBody,
  createSonarProvider,
  parseImages,
  parseSources,
  parseUsage,
} from "../src/lib/search/sonar";
import { foldFiltersIntoQuery } from "../src/lib/search/provider";
import type { FollowUpRequest, SearchRequest } from "../src/lib/search/provider";

const NO_FILTERS = { domainsAllow: [], domainsDeny: [] };

function req(over: Partial<SearchRequest> = {}): SearchRequest {
  return { query: "chickens?", filters: NO_FILTERS, ...over };
}

/** A fetch that records what it was called with and replays a canned response. */
function fakeFetch(body: unknown, init: { status?: number; text?: string } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, reqInit: RequestInit) => {
    calls.push({ url, init: reqInit });
    return {
      ok: (init.status ?? 200) < 400,
      status: init.status ?? 200,
      json: async () => body,
      text: async () => init.text ?? JSON.stringify(body),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const ANSWER = {
  model: "sonar",
  choices: [{ message: { content: "Feed them seeds.[1]" } }],
  search_results: [
    { title: "Chicken", url: "https://minecraft.wiki/w/Chicken", snippet: "Chickens…" },
  ],
  usage: {
    prompt_tokens: 12,
    completion_tokens: 30,
    num_search_queries: 2,
    cost: { total_cost: 0.0061 },
  },
};

test("sends allow and deny as one domain filter, denials prefixed with a dash", () => {
  const warnings: string[] = [];
  const body = buildRequestBody(
    req({ filters: { domainsAllow: ["minecraft.wiki"], domainsDeny: ["pinterest.com"] } }),
    "sonar",
    warnings,
  );
  assert.deepEqual(body.search_domain_filter, ["minecraft.wiki", "-pinterest.com"]);
  assert.deepEqual(warnings, []);
});

test("omits the domain filter entirely when the space sets no preference", () => {
  const body = buildRequestBody(req(), "sonar", []);
  assert.ok(!("search_domain_filter" in body));
});

test("truncates an over-long domain filter and says so rather than failing", () => {
  const warnings: string[] = [];
  const many = Array.from({ length: 14 }, (_, i) => `d${i}.com`);
  const body = buildRequestBody(
    req({ filters: { domainsAllow: many, domainsDeny: [] } }),
    "sonar",
    warnings,
  );
  assert.equal((body.search_domain_filter as string[]).length, 10);
  assert.match(warnings.join(" "), /4 were dropped/);
});

test("preserves source order, because the answer's [n] markers index into it", () => {
  const sources = parseSources({
    search_results: [
      { title: "One", url: "https://a.com" },
      { title: "Two", url: "https://b.com" },
    ],
  });
  assert.deepEqual(
    sources.map((s) => s.url),
    ["https://a.com", "https://b.com"],
  );
});

test("falls back to the bare citations list when there are no search results", () => {
  const sources = parseSources({ citations: ["https://www.example.com/page"] });
  assert.deepEqual(sources, [{ title: "example.com", url: "https://www.example.com/page" }]);
});

test("titles a source by host when the response gives no title", () => {
  const sources = parseSources({ search_results: [{ url: "https://www.minecraft.wiki/w/X" }] });
  assert.equal(sources[0].title, "minecraft.wiki");
});

test("reports cost when the provider gives one", () => {
  assert.equal(parseUsage(ANSWER, "sonar").costUsd, 0.0061);
  assert.equal(parseUsage({ usage: { prompt_tokens: 1 } }, "sonar").costUsd, undefined);
});

test("counts tokens and searches, defaulting missing fields to zero", () => {
  const u = parseUsage({ model: "sonar-pro" }, "sonar");
  assert.deepEqual(u, { model: "sonar-pro", inputTokens: 0, outputTokens: 0, searchQueries: 0 });
});

test("drops images that carry no url", () => {
  const images = parseImages({ images: [{ image_url: "https://a/i.png" }, { title: "no url" }] });
  assert.deepEqual(images, [{ image_url: "https://a/i.png" }]);
});

test("sends one request, bearing the key, and returns the parsed answer", async () => {
  const { impl, calls } = fakeFetch(ANSWER);
  const provider = createSonarProvider({ apiKey: "pplx-test", fetchImpl: impl });

  const res = await provider.search(req());

  assert.equal(calls.length, 1, "exactly one request per search — no retries");
  assert.equal(calls[0].url, "https://api.perplexity.ai/chat/completions");
  assert.equal(
    (calls[0].init.headers as Record<string, string>).Authorization,
    "Bearer pplx-test",
  );
  assert.equal(res.answerMarkdown, "Feed them seeds.[1]");
  assert.equal(res.sources[0].url, "https://minecraft.wiki/w/Chicken");
  assert.equal(res.usage?.costUsd, 0.0061);
});

test("declares that it applies source preferences natively", () => {
  const provider = createSonarProvider({ apiKey: "k", fetchImpl: fakeFetch(ANSWER).impl });
  assert.equal(provider.appliesFiltersNatively, true);
});

test("names the environment variable when the key is rejected", async () => {
  const { impl } = fakeFetch({}, { status: 401, text: "unauthorized" });
  const provider = createSonarProvider({ apiKey: "bad", fetchImpl: impl });
  await assert.rejects(provider.search(req()), /PERPLEXITY_API_KEY/);
});

test("does not retry a rate-limited search", async () => {
  const { impl, calls } = fakeFetch({}, { status: 429, text: "slow down" });
  const provider = createSonarProvider({ apiKey: "k", fetchImpl: impl });
  await assert.rejects(provider.search(req()), /rate limiting/);
  assert.equal(calls.length, 1);
});

test("treats an empty answer as a failure rather than a blank result", async () => {
  const { impl } = fakeFetch({ choices: [{ message: { content: "  " } }] });
  const provider = createSonarProvider({ apiKey: "k", fetchImpl: impl });
  await assert.rejects(provider.search(req()), /empty answer/);
});

test("restates filters as prose only for providers that cannot apply them", () => {
  const folded = foldFiltersIntoQuery("Q", {
    domainsAllow: ["a.com"],
    domainsDeny: ["b.com"],
  });
  assert.equal(folded, "Q\n\nPrefer sources from a.com. Do not use b.com.");
  assert.equal(foldFiltersIntoQuery("Q", NO_FILTERS), "Q");
});

function followUp(over: Partial<FollowUpRequest> = {}): FollowUpRequest {
  return {
    question: "what about ducks?",
    turns: [{ question: "Context: minecraft\n\nchickens?", answerMarkdown: "Feed them seeds." }],
    filters: NO_FILTERS,
    ...over,
  };
}

test("continues a conversation by sending the exchange so far as messages", () => {
  const body = buildFollowUpBody(followUp(), "sonar", []) as {
    messages: { role: string; content: string }[];
  };

  assert.deepEqual(body.messages, [
    { role: "user", content: "Context: minecraft\n\nchickens?" },
    { role: "assistant", content: "Feed them seeds." },
    { role: "user", content: "what about ducks?" },
  ]);
});

test("a follow-up carries the brief only in the turn it was compiled into", () => {
  const body = buildFollowUpBody(followUp(), "sonar", []) as {
    messages: { role: string; content: string }[];
  };
  const last = body.messages.at(-1)!;

  // The point of the ordering is that the brief steers the *first* search. It
  // is present in the exchange, so restating it here would only spend tokens.
  assert.equal(last.content, "what about ducks?");
  assert.ok(!last.content.includes("Context:"));
  assert.ok(body.messages[0].content.includes("Context: minecraft"));
});

test("a follow-up still applies the space's source preferences", () => {
  const warnings: string[] = [];
  const body = buildFollowUpBody(
    followUp({ filters: { domainsAllow: ["minecraft.wiki"], domainsDeny: ["example.com"] } }),
    "sonar",
    warnings,
  );
  assert.deepEqual(body.search_domain_filter, ["minecraft.wiki", "-example.com"]);
  assert.deepEqual(warnings, []);
});

test("sends a follow-up as one request and parses it like any other answer", async () => {
  const { impl, calls } = fakeFetch(ANSWER);
  const provider = createSonarProvider({ apiKey: "k", fetchImpl: impl });

  const out = await provider.followUp!(followUp());

  assert.equal(calls.length, 1, "one request per action");
  const sent = JSON.parse(String(calls[0].init.body)) as {
    messages: { role: string }[];
  };
  assert.deepEqual(sent.messages.map((m) => m.role), ["user", "assistant", "user"]);
  assert.equal(out.answerMarkdown, "Feed them seeds.[1]");
  assert.equal(out.sources[0].url, "https://minecraft.wiki/w/Chicken");
  assert.equal(out.usage?.costUsd, 0.0061);
});

test("says a cancelled search was cancelled, not that the API was unreachable", async () => {
  const impl = (async () => {
    const err = new Error("This operation was aborted");
    err.name = "AbortError";
    throw err;
  }) as unknown as typeof fetch;
  const provider = createSonarProvider({ apiKey: "k", fetchImpl: impl });

  // The caller stopped it; nothing was unreachable, and saying so would send
  // whoever reads it off checking a network that was fine.
  await assert.rejects(provider.search(req()), /cancelled/);
  await assert.rejects(provider.search(req()), (e: Error) => !/unreachable|reach the/.test(e.message));
});

test("still reports a genuinely unreachable API as unreachable", async () => {
  const impl = (async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;
  const provider = createSonarProvider({ apiKey: "k", fetchImpl: impl });
  await assert.rejects(provider.search(req()), /Could not reach the Perplexity API/);
});

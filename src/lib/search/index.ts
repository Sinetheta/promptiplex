import path from "node:path";
import { pathToFileURL } from "node:url";
import { createSonarProvider, type SonarModel } from "./sonar";
import type { SearchProvider } from "./provider";

export * from "./provider";
export { createSonarProvider, SONAR_MODELS } from "./sonar";
export type { SonarModel } from "./sonar";

/**
 * Chooses the provider for this process.
 *
 * By default that is Sonar, configured from the environment. `PROMPTIPLEX_PROVIDER_MODULE`
 * replaces it with a module of your own — anything satisfying `SearchProvider`
 * in `./provider.ts` will do. The module's default export may be either the
 * provider itself or a function returning one (`async` is fine):
 *
 *     // local/my-provider.ts
 *     import type { SearchProvider } from "@/lib/search";
 *     const provider: SearchProvider = { id: "mine", label: "Mine", … };
 *     export default provider;
 *
 *     PROMPTIPLEX_PROVIDER_MODULE=./local/my-provider.ts npm run ask -- "…"
 *
 * `local/` is gitignored, so a provider kept there stays out of the repo.
 */

let cached: Promise<SearchProvider> | null = null;

export function resolveProvider(): Promise<SearchProvider> {
  cached ??= build();
  return cached;
}

/** Test seam — drops the memoised provider so the next call rebuilds it. */
export function resetProvider(): void {
  cached = null;
}

async function build(): Promise<SearchProvider> {
  const custom = process.env.PROMPTIPLEX_PROVIDER_MODULE?.trim();
  if (custom) return loadCustomProvider(custom);

  return createSonarProvider({
    apiKey: requireApiKey(),
    model: (process.env.PROMPTIPLEX_MODEL?.trim() as SonarModel) || "sonar",
  });
}

function requireApiKey(): string {
  const key = process.env.PERPLEXITY_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "PERPLEXITY_API_KEY is not set. Copy .env.example to .env and add a key from " +
        "https://www.perplexity.ai/account/api/group — or point PROMPTIPLEX_PROVIDER_MODULE " +
        "at a provider of your own.",
    );
  }
  return key;
}

async function loadCustomProvider(spec: string): Promise<SearchProvider> {
  const url = spec.startsWith(".") || path.isAbsolute(spec)
    ? pathToFileURL(path.resolve(process.cwd(), spec)).href
    : spec;

  let mod: { default?: unknown };
  try {
    // The specifier is only known at runtime, so the bundlers are told to leave
    // it alone rather than trying to trace it at build time.
    mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url)) as {
      default?: unknown;
    };
  } catch (err) {
    throw new Error(
      `PROMPTIPLEX_PROVIDER_MODULE could not be loaded from "${spec}": ${(err as Error).message}`,
    );
  }

  const exported = mod.default;
  const provider = typeof exported === "function" ? await exported() : exported;

  if (!isProvider(provider)) {
    throw new Error(
      `PROMPTIPLEX_PROVIDER_MODULE "${spec}" must default-export a SearchProvider ` +
        "(or a function returning one) with id, label, and search().",
    );
  }
  return provider;
}

function isProvider(v: unknown): v is SearchProvider {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<SearchProvider>;
  return typeof p.id === "string" && typeof p.label === "string" && typeof p.search === "function";
}

import { createHash } from "node:crypto";
import type { SpaceInput } from "./types";

/**
 * Identifies a space by the wording that actually reaches the provider.
 *
 * A space is edited over time, and a query recorded last month was compiled
 * from wording that may no longer exist. Storing the space's *id* alongside a
 * query therefore says which space was picked, not what it said — and what it
 * said is the thing a later review would want to compare against results.
 *
 * So each distinct wording gets a row of its own, found by this fingerprint.
 * Editing a space and editing it back reuses the first row rather than minting
 * a third, which is what makes "queries asked under wording A" a group that can
 * be counted.
 *
 * Only the four fields that are sent are hashed:
 *
 * - `brief` and `queryTemplate` become the query text (see `compile`).
 * - `domainsAllow` / `domainsDeny` travel as filters and constrain retrieval.
 *
 * `name` and `icon` are excluded deliberately. They exist so a human can pick
 * the right space and are never sent, so renaming one changes nothing about
 * what was retrieved — minting a version for it would split a group of queries
 * that are, as far as the search is concerned, identical.
 *
 * Domain order is preserved rather than sorted: the provider caps the combined
 * list, and `sonar.ts` truncates from the end, so two orderings of the same
 * domains can genuinely search differently.
 */
export function spaceFingerprint(space: Pick<SpaceInput, VersionedField>): string {
  const canonical = JSON.stringify([
    space.brief,
    space.queryTemplate,
    space.domainsAllow,
    space.domainsDeny,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

export type VersionedField = "brief" | "queryTemplate" | "domainsAllow" | "domainsDeny";

/** The fields a fingerprint covers, in the order they are hashed. */
export const VERSIONED_FIELDS: VersionedField[] = [
  "brief",
  "queryTemplate",
  "domainsAllow",
  "domainsDeny",
];

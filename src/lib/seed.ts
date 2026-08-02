import { countSpaces, createSpace } from "./db";
import { spaceInputSchema } from "./types";

/**
 * Seeded on first run so the app is usable immediately, and so the Minecraft
 * case that motivated the project is there as a worked example.
 */
const SEEDS = [
  {
    name: "Minecraft",
    icon: "⛏️",
    brief:
      "I play Minecraft Java Edition 1.21 in survival mode, single player, no mods. " +
      "Every question is about in-game mechanics, never about the real world. " +
      "Give exact game values: tick counts, drop rates, spawn conditions, item names.",
    queryTemplate: "Minecraft Java Edition 1.21 survival: {q}",
    domainsAllow: ["minecraft.wiki"],
    domainsDeny: [],
  },
  {
    name: "Papers",
    icon: "📄",
    brief:
      "Answer from peer-reviewed literature. Lead with the finding, name the study " +
      "design and sample size, and say so when the evidence is thin or contested.",
    queryTemplate: "{q}",
    domainsAllow: ["pubmed.ncbi.nlm.nih.gov", "arxiv.org"],
    domainsDeny: [],
  },
  {
    name: "Plain search",
    icon: "🔎",
    brief: "",
    queryTemplate: "{q}",
    domainsAllow: [],
    domainsDeny: [],
  },
];

export function seedIfEmpty(): void {
  if (countSpaces() > 0) return;
  for (const s of SEEDS) {
    createSpace(spaceInputSchema.parse(s));
  }
}

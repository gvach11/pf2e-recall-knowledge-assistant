// Mirrors pf2e's own identifySkills trait->skill map (SPEC.md §2). Used both
// for hazard skill-relevance fallback (NPCs get this from pf2e's own
// identificationDCs.skills instead) and as the fixed pool of creature-type
// traits used for false-trait generation on a critical failure.
export const CREATURE_TRAIT_SKILLS = Object.freeze({
  aberration: ["occultism"],
  animal: ["nature"],
  astral: ["occultism"],
  beast: ["arcana", "nature"],
  celestial: ["religion"],
  construct: ["arcana", "crafting"],
  dragon: ["arcana"],
  dream: ["occultism"],
  elemental: ["arcana", "nature"],
  ethereal: ["occultism"],
  fey: ["nature"],
  fiend: ["religion"],
  fungus: ["nature"],
  humanoid: ["society"],
  monitor: ["religion"],
  ooze: ["occultism"],
  plant: ["nature"],
  shade: ["religion"],
  spirit: ["occultism"],
  time: ["occultism"],
  undead: ["religion"],
});

// Hazards have no identification table. Each entry is derived from AoN
// (checked 2026-10-29): Crafting covers engineering and mechanical things
// (Skills ID=37); magical hazards are learned via Identify Magic / Recall
// Knowledge (Rules ID=2847), i.e. the tradition's skill; "haunts can often
// be overcome with Occultism or Religion" (Rules ID=668); environmental
// hazards are natural phenomena, so Nature (Survival disables them but
// isn't a Recall Knowledge skill). A bare "trap" says nothing about how it
// works, so it has no entry. Also the pool for false hazard traits.
export const HAZARD_TRAIT_SKILLS = Object.freeze({
  mechanical: ["crafting"],
  magical: ["arcana", "nature", "occultism", "religion"],
  haunt: ["occultism", "religion"],
  environmental: ["nature"],
  arcane: ["arcana"],
  divine: ["religion"],
  occult: ["occultism"],
  primal: ["nature"],
});

// A tradition trait pins a magical hazard to one skill, so the generic
// "any tradition" `magical` entry no longer applies.
export const TRADITION_TRAITS = Object.freeze(["arcane", "divine", "occult", "primal"]);

// Not creature types, but what a hazard "is" for the baseline sentence
// ("Hidden Pit is a trap."). Never offered as a false hazard trait, since
// that would contradict the baseline printed right above it.
export const HAZARD_IDENTITY_TRAITS = Object.freeze(["haunt", "trap"]);

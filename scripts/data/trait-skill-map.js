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

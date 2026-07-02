/**
 * Rolls a Recall Knowledge check via pf2e's own built-in action (so bonus
 * math stays aligned with the system), but suppresses its default chat
 * card entirely — that card would print the DC and degree of success,
 * which must never reach the player (SPEC.md §4 "Roll execution"). We only
 * read back the raw roll total and the natural d20, and compute
 * degree-of-success ourselves elsewhere (see data/dc-table.js).
 */
export async function rollRecallKnowledge({ rollingActor, targetActor, statistic, event }) {
  const action = game.pf2e.actions.get("recall-knowledge");
  if (!action) {
    throw new Error("pf2e's built-in recall-knowledge action is unavailable");
  }

  const results = await action.use({
    statistic,
    actors: rollingActor,
    target: targetActor,
    message: { create: false },
    event,
  });

  const result = results?.[0];
  const roll = result?.roll;
  if (!roll || typeof roll.total !== "number") {
    return null;
  }

  return {
    rollTotal: roll.total,
    naturalD20: extractNaturalD20(roll),
  };
}

function extractNaturalD20(roll) {
  const d20Term = roll.terms?.find((term) => term.faces === 20);
  const naturalResult = d20Term?.results?.find((r) => r.active !== false);
  return naturalResult?.result ?? null;
}

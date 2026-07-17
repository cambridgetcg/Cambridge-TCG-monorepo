// The PVE seal, stated once. Durable battles and rewards stay closed while
// server-side rules validation is completed (the vanilla validation layer
// in validate.ts is the first slice of that work; effects interpretation
// remains). Practice battles run browser-local — they never touch the
// mutation path this object seals, so mutations_enabled stays false.

export const PVE_AVAILABILITY = {
  mode: "read_only",
  mutations_enabled: false,
  rewards_enabled: false,
  reason:
    "Durable PVE battles and rewards are paused while server-side rules validation is completed.",
  practice:
    "Practice battles run locally in your browser — nothing durable is recorded and nothing is paid.",
} as const;

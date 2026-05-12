/**
 * Glicko-2 rating system — pure function, no I/O.
 *
 * Reference paper: http://www.glicko.net/glicko/glicko2.pdf
 *
 * Used by the agent ladder. Two-player update only — `updatePair` takes
 * both agents' pre-match state plus the outcome and returns both
 * agents' post-match state. (Glicko-2's design also supports period-
 * batched updates across many results; we use the per-match form because
 * the platform updates ratings the moment a match finishes.)
 *
 * The implementation follows the paper's notation: ratings on the
 * "Glicko-2 scale" use mu (= (r - 1500) / 173.7178) and phi (= rd / 173.7178);
 * volatility sigma is on its natural scale.
 *
 * Tau is the system constant constraining volatility change between
 * rating periods. 0.5 is the paper's typical default for chess-like
 * games; lower means more stable ratings, higher means faster reaction
 * to upsets. Picked 0.5 here; revisit if the ladder feels too volatile.
 */

const SCALE = 173.7178;
const TAU = 0.5;
const EPS = 1e-6;

export interface GlickoState {
  rating: number;
  rd: number;
  vol: number;
}

export interface MatchUpdate {
  a: GlickoState;
  b: GlickoState;
}

/** Outcome from `a`'s perspective. */
export type Outcome = "a_wins" | "b_wins" | "draw";

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function E(mu: number, muOpp: number, phiOpp: number): number {
  return 1 / (1 + Math.exp(-g(phiOpp) * (mu - muOpp)));
}

function updateOne(
  self: GlickoState,
  opp: GlickoState,
  score: number, // 1 / 0.5 / 0
): GlickoState {
  const mu = (self.rating - 1500) / SCALE;
  const phi = self.rd / SCALE;
  const sigma = self.vol;
  const muOpp = (opp.rating - 1500) / SCALE;
  const phiOpp = opp.rd / SCALE;

  const gOpp = g(phiOpp);
  const Eval = E(mu, muOpp, phiOpp);

  // Step 3: variance of opponent's rating-based performance estimate.
  const v = 1 / (gOpp * gOpp * Eval * (1 - Eval));

  // Step 4: estimated improvement in rating.
  const delta = v * gOpp * (score - Eval);

  // Step 5: new volatility via the iterative Illinois algorithm from the paper.
  const a = Math.log(sigma * sigma);
  const f = (x: number) => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * Math.pow(phi * phi + v + ex, 2);
    return num / den - (x - a) / (TAU * TAU);
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }
  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > EPS) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB < 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }
  const sigmaPrime = Math.exp(A / 2);

  // Step 6: update RD before the match (pre-period decay).
  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);

  // Step 7: update rating and RD using the match result.
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime = mu + phiPrime * phiPrime * gOpp * (score - Eval);

  return {
    rating: 1500 + SCALE * muPrime,
    rd: SCALE * phiPrime,
    vol: sigmaPrime,
  };
}

/**
 * Apply one match result to both players. Glicko-2's symmetric:
 * each player is updated against their pre-match opponent state.
 */
export function updatePair(a: GlickoState, b: GlickoState, outcome: Outcome): MatchUpdate {
  let scoreA: number;
  switch (outcome) {
    case "a_wins": scoreA = 1; break;
    case "b_wins": scoreA = 0; break;
    case "draw":   scoreA = 0.5; break;
  }
  const newA = updateOne(a, b, scoreA);
  const newB = updateOne(b, a, 1 - scoreA);
  return { a: newA, b: newB };
}

export function defaultGlickoState(): GlickoState {
  return { rating: 1500, rd: 350, vol: 0.06 };
}

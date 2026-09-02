import "server-only";
import {
  PRISM_SIGNALS_BETA_MODE,
} from "./beta-interest";

/** Configuration-only gate: no auth import, database import, or I/O. */
export function prismSignalsBetaIntakeEnabled(): boolean {
  return process.env.PRISM_SIGNALS_BETA_MODE?.trim() === PRISM_SIGNALS_BETA_MODE;
}

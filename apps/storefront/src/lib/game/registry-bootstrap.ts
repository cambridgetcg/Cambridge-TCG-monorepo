/**
 * Engine registration bootstrap.
 *
 * Importing this module side-effect-registers every shipped engine.
 * The PVE route imports this once at module load so getEngine() finds
 * the OPTCG engine on the first request.
 *
 * Adding a new engine in Phase 2+:
 *   1. Create the engine adapter (e.g. pokemon-engine.ts).
 *   2. Import + register it below.
 *   3. That's it — the route's dispatch goes through getEngine(code).
 */

import { register } from "@cambridge-tcg/play";
import { optcgEngine } from "./optcg-engine";

register(optcgEngine);
// Future:
// import { pokemonEngine } from "./pokemon-engine"; register(pokemonEngine);
// import { mtgEngine } from "./mtg-engine"; register(mtgEngine);

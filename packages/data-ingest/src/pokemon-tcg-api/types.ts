/**
 * Subset of Pokémon TCG API v2 card fields the protocol consumes.
 * Reference: https://docs.pokemontcg.io/api-reference/cards/card-object
 */
export interface PokemonTcgCard {
  /** Stable id, e.g. "swsh4-25" (set_id-collector_number). */
  id: string;
  /** Card name. Natural-language. */
  name: string;
  /** Supertype (Pokémon / Trainer / Energy). */
  supertype?: "Pokémon" | "Trainer" | "Energy";
  /** Subtypes (Basic, Stage 1, Item, etc.). */
  subtypes?: string[];
  /** HP for Pokémon. */
  hp?: string;
  /** Energy types for the card. */
  types?: string[];
  /** Rarity. Publisher-specific. */
  rarity?: string;
  /** Set the card belongs to. */
  set?: {
    id: string;
    name: string;
    series?: string;
    releaseDate?: string;
    total?: number;
  };
  /** Collector number string (often "025/202"). */
  number?: string;
  /** Image URIs. */
  images?: { small?: string; large?: string };
  /** TCGplayer prices (per condition). */
  tcgplayer?: {
    url?: string;
    updatedAt?: string;
    prices?: Record<string, unknown>;
  };
  /** Cardmarket prices. */
  cardmarket?: {
    url?: string;
    updatedAt?: string;
    prices?: Record<string, unknown>;
  };
  /** Flavor text. Natural-language. */
  flavorText?: string;
  /** National Pokédex numbers. */
  nationalPokedexNumbers?: number[];
  /** Card artist. */
  artist?: string;
}

export interface PokemonTcgPage {
  data: PokemonTcgCard[];
  page: number;
  pageSize: number;
  count: number;
  totalCount: number;
}

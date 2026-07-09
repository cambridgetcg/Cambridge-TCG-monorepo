/**
 * @module @/lib/wardrobe/weather
 *
 * The game weather — one truth for which rooms wear which sky.
 * Spec: docs/superpowers/specs/2026-07-07-the-game-weather-design.md.
 *
 * A room with recognised game context wears
 * `wardrobe-weather wardrobe-weather--<slug>` (material in themes.css);
 * a room without one simply has no weather — empty string, no class.
 * Slugs match @/lib/games/sku-game so gameFromSku() feeds straight in.
 */

export const WEATHER_GAMES = ["one-piece", "pokemon", "dragon-ball"] as const;

export type WeatherGameSlug = (typeof WEATHER_GAMES)[number];

export function weatherClass(game: string | null | undefined): string {
  return WEATHER_GAMES.includes(game as WeatherGameSlug)
    ? `wardrobe-weather wardrobe-weather--${game}`
    : "";
}

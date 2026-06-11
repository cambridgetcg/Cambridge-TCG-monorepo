/**
 * Mission Templates - Server Re-exports
 *
 * Re-exports from the shared constants file for server-side usage.
 * The actual templates are defined in app/constants/mission-templates.ts
 * to allow usage on both client and server.
 */

export {
  type MissionCadence,
  type MissionRarity,
  type MissionCategory,
  type MissionTemplate,
  DAILY_TEMPLATES,
  WEEKLY_TEMPLATES,
  MONTHLY_TEMPLATES,
  SPECIAL_TEMPLATES,
  ALL_TEMPLATES,
  TEMPLATES_BY_CADENCE,
  getTemplatesByCadence,
  getTemplateById,
  calculateMissionDates,
} from "../constants/mission-templates";

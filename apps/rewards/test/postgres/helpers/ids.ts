const ANY_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * `text` with every UUID replaced by `<id>`. Row ids are random UUIDs, which
 * can hold a buyer id such as 7001 among their digits, so a check that a log
 * line or a report names no buyer looks at this, not at the raw text.
 */
export const noIds = (text: string): string => text.replace(ANY_UUID, "<id>");

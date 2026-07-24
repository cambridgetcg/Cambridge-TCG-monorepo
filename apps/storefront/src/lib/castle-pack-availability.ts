/** One bounded brake for the Open Door table and its stateless referee. */
export function castlePackIsDisabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.CASTLE_PACK_DISABLED === "1";
}

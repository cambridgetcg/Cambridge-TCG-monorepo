/**
 * Whether a pasted signing key looks like a private key, judged on the raw
 * paste before anything parses it (docs/plans/agent-auth/held-keys.md, "At
 * binding"). The server's binding (checkBindingJwk in signed-act-verify.ts)
 * and the paste form at /account/agents (signing-key-ui.ts) both call this,
 * so they refuse the same pastes with the same words. Pure, with no imports,
 * so it adds nothing to the client bundle.
 *
 * Generous on purpose: a false alarm costs a re-paste, while a miss sends a
 * private half over the network. Neither caller echoes, stores or logs the
 * paste; the answer is the fixed text below.
 */

/** What the operator is told. */
export const PRIVATE_KEY_PASTE_ERROR =
  'That looks like a private key (it has a "d" member or private-key armour). It was not stored or logged. Treat it as exposed: make a new key pair and paste only its public JWK.';

const PRIVATE_KEY_SIGNS: readonly RegExp[] = [
  // PEM armour: PKCS #8, PKCS #1, SEC 1, OpenSSH, encrypted or not.
  /PRIVATE KEY/i,
  // A "d" member however it is written: quoted either way or not at all,
  // followed by : or = (JSON, a JavaScript literal, Node's console.log of a
  // JWK, YAML, env-style), valid JSON or not.
  /(?:^|[\s{,"'])d["']?\s*[:=]/m,
  // "d" written as a JSON escape.
  /\\u0064/i,
  // An Ed25519 PKCS #8 private key in base64 DER, without armour: the
  // encoding of its fixed prefix (version 0, then version 1 with the public
  // key), wherever it starts.
  /MC4CAQAwBQYDK2Vw|MFECAQEwBQYDK2Vw/,
];

export function looksLikePrivateKey(paste: string): boolean {
  return PRIVATE_KEY_SIGNS.some((sign) => sign.test(paste));
}

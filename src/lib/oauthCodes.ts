/**
 * In-memory one-time code store for Google OAuth.
 *
 * After the OAuth callback succeeds, the backend stores a short-lived code here
 * and redirects the frontend with ?code=XYZ. The frontend immediately POSTs the
 * code to /auth/exchange-code to receive real tokens. The code is single-use and
 * expires after 60 seconds.
 *
 * Why not Redis? The exchange happens within the same browser session that just
 * hit the server — the server won't spin down between the redirect and the POST.
 */

interface OAuthCodeData {
  userId: string;
  tokenVersion: number;
}

interface OAuthCodeEntry {
  data: OAuthCodeData;
  expiresAt: number;
}

const store = new Map<string, OAuthCodeEntry>();

/**
 * Store a one-time code. Automatically cleans up after TTL.
 */
export function storeOAuthCode(code: string, data: OAuthCodeData): void {
  const TTL_MS = 60_000; // 60 seconds
  store.set(code, { data, expiresAt: Date.now() + TTL_MS });
  setTimeout(() => store.delete(code), TTL_MS);
}

/**
 * Consume a one-time code. Returns the associated data, or null if the code
 * is invalid, already used, or expired. Always deletes the code after lookup.
 */
export function consumeOAuthCode(code: string): OAuthCodeData | null {
  const entry = store.get(code);
  store.delete(code); // always delete — single use

  if (!entry) return null;
  if (Date.now() > entry.expiresAt) return null;

  return entry.data;
}

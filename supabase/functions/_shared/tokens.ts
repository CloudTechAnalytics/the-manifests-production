/*
 * Same hash-not-token pattern as invitations (see migration 015's
 * docstring): only the SHA-256 of the token is ever stored, so read access
 * to a tokens table can never be used to verify/accept on someone else's
 * behalf. The raw token exists in exactly one place — the emailed link.
 */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/*
 * Server-side mirror of components/auth/password-strength.tsx's rules.
 * Deno edge functions and the Next.js app build separately (no shared
 * package between them), so this list is intentionally duplicated rather
 * than imported across runtimes — keep the two in sync if either changes.
 *
 * The blocklist is a curated sample of the passwords that show up at the
 * top of every public breach-corpus frequency list (RockYou and similar).
 * It is a practical, dependency-free stand-in for "prevent commonly
 * compromised passwords" — not a HaveIBeenPwned k-anonymity lookup, which
 * would add an external network call into the critical registration path.
 */

export const MIN_PASSWORD_LENGTH = 10;

export const COMMON_PASSWORDS = new Set([
  "123456", "123456789", "12345678", "12345", "1234567", "1234567890",
  "qwerty", "qwerty123", "password", "password1", "password123",
  "111111", "123123", "abc123", "1q2w3e4r", "iloveyou", "000000",
  "monkey", "dragon", "letmein", "trustno1", "sunshine", "master",
  "welcome", "welcome1", "shadow", "ashley", "football", "jesus",
  "michael", "ninja", "mustang", "password!", "admin", "admin123",
  "root", "toor", "changeme", "qazwsx", "1qaz2wsx", "zaq12wsx",
  "superman", "batman", "starwars", "freedom", "whatever", "qwertyuiop",
  "1q2w3e", "654321", "7777777", "121212", "asdfghjkl", "asdf1234",
  "passw0rd", "p@ssw0rd", "p@ssword", "letmein123", "hello123",
  "charlie", "donald", "george", "thomas", "michelle", "jennifer",
  "hunter2", "iloveyou1", "princess", "flower", "loveme", "solo",
  "666666", "888888", "abcd1234", "abcdefgh", "aaaaaaaa", "11111111",
  "88888888", "1qazxsw2", "zxcvbnm", "zxcvbn123", "google", "facebook",
  "amazon123", "logistics", "shipping1", "freight123", "manifest123",
]);

export interface PasswordCheck {
  ok: boolean;
  reason?: string;
}

/** The one server-side gate — mirrors the client-side meter's hard rules. */
export function checkPasswordPolicy(password: string): PasswordCheck {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  const classes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length;
  if (classes < 3) {
    return {
      ok: false,
      reason: "Password must include at least 3 of: lowercase, uppercase, numbers, symbols",
    };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { ok: false, reason: "That password is too common — please choose another" };
  }
  return { ok: true };
}

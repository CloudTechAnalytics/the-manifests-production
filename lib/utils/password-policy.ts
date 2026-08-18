/*
 * Client-side mirror of supabase/functions/_shared/password-policy.ts —
 * the edge function is Deno and builds separately from this Next.js app
 * (no shared package between the two runtimes), so this list is
 * intentionally duplicated rather than imported across them. Keep both in
 * sync if either changes; the server-side copy is the one that actually
 * gates registration, this one only drives the live strength meter.
 */

export const MIN_PASSWORD_LENGTH = 10;

export const COMMON_PASSWORDS = new Set([
  '123456', '123456789', '12345678', '12345', '1234567', '1234567890',
  'qwerty', 'qwerty123', 'password', 'password1', 'password123',
  '111111', '123123', 'abc123', '1q2w3e4r', 'iloveyou', '000000',
  'monkey', 'dragon', 'letmein', 'trustno1', 'sunshine', 'master',
  'welcome', 'welcome1', 'shadow', 'ashley', 'football', 'jesus',
  'michael', 'ninja', 'mustang', 'password!', 'admin', 'admin123',
  'root', 'toor', 'changeme', 'qazwsx', '1qaz2wsx', 'zaq12wsx',
  'superman', 'batman', 'starwars', 'freedom', 'whatever', 'qwertyuiop',
  '1q2w3e', '654321', '7777777', '121212', 'asdfghjkl', 'asdf1234',
  'passw0rd', 'p@ssw0rd', 'p@ssword', 'letmein123', 'hello123',
  'charlie', 'donald', 'george', 'thomas', 'michelle', 'jennifer',
  'hunter2', 'iloveyou1', 'princess', 'flower', 'loveme', 'solo',
  '666666', '888888', 'abcd1234', 'abcdefgh', 'aaaaaaaa', '11111111',
  '88888888', '1qazxsw2', 'zxcvbnm', 'zxcvbn123', 'google', 'facebook',
  'amazon123', 'logistics', 'shipping1', 'freight123', 'manifest123',
]);

export type PasswordStrength = 'too_weak' | 'weak' | 'fair' | 'strong';

export interface PasswordRequirement {
  id: string;
  label: string;
  met: boolean;
}

export interface PasswordEvaluation {
  requirements: PasswordRequirement[];
  allRequirementsMet: boolean;
  strength: PasswordStrength;
  score: number; // 0-4
}

/** Live evaluation for the strength meter — every rule the server enforces, plus a granular score for the meter fill. */
export function evaluatePassword(password: string): PasswordEvaluation {
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);
  const classCount = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  const isCommon = COMMON_PASSWORDS.has(password.toLowerCase());

  const requirements: PasswordRequirement[] = [
    { id: 'length', label: `At least ${MIN_PASSWORD_LENGTH} characters`, met: password.length >= MIN_PASSWORD_LENGTH },
    { id: 'variety', label: 'At least 3 of: lowercase, uppercase, numbers, symbols', met: classCount >= 3 },
    { id: 'common', label: 'Not a commonly used password', met: password.length > 0 && !isCommon },
  ];
  const allRequirementsMet = requirements.every((r) => r.met);

  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score++;
  if (password.length >= 14) score++;
  if (classCount >= 3) score++;
  if (classCount === 4) score++;
  if (isCommon) score = 0;

  const strength: PasswordStrength =
    password.length === 0 ? 'too_weak' : score <= 1 ? 'weak' : score <= 2 ? 'fair' : score <= 3 ? 'strong' : 'strong';

  return { requirements, allRequirementsMet, strength, score: Math.min(score, 4) };
}

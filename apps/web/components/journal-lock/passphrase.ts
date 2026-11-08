export const MIN_PASSPHRASE = 10;

/** A gentle hint, not a gate: length matters most, because the passphrase protects the key offline. */
export function passphraseHint(value: string): { text: string; ok: boolean } {
  if (value.length === 0) return { text: "Try three or four unrelated words, like “lamp river orbit tea”.", ok: false };
  if (value.length < MIN_PASSPHRASE) return { text: `At least ${MIN_PASSPHRASE} characters.`, ok: false };
  const words = value.trim().split(/\s+/).length;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9\s]/].filter((re) => re.test(value)).length;
  if (value.length >= 16 || (words >= 3 && value.length >= 12) || kinds >= 3) return { text: "Strong.", ok: true };
  return { text: "Okay. Longer is stronger: add another word.", ok: true };
}

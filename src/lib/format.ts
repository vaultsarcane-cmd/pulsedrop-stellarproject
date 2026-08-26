/**
 * Formatting helpers shared across PulseDrop components.
 */

/** Abbreviate a Stellar public key: GABC...WXYZ. */
export function abbreviatePublicKey(publicKey: string, keep = 4): string {
  if (publicKey.length <= keep * 2 + 3) return publicKey;
  return `${publicKey.slice(0, keep)}...${publicKey.slice(-keep)}`;
}

/** Format a raw XLM balance string to at most 7 decimal places without trailing zeros. */
export function formatXlmAmount(rawBalance: string): string {
  const parsed = Number.parseFloat(rawBalance);
  if (Number.isNaN(parsed)) return "0";
  return parsed.toLocaleString("en-US", { maximumFractionDigits: 7 });
}

export const PUBLIC_KEY_PATTERN = /^G[A-Z2-7]{55}$/;

export function isValidStellarPublicKey(value: string): boolean {
  return PUBLIC_KEY_PATTERN.test(value.trim());
}

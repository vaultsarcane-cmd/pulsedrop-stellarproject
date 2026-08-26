/**
 * Typed wrapper around the Freighter browser extension.
 * Every method maps Freighter's responses into a small, explicit result
 * type so the UI never has to parse raw SDK payloads.
 */

export interface WalletConnectionResult {
  ok: boolean;
  publicKey?: string;
  error?: WalletErrorCode;
}

export interface NetworkCheckResult {
  ok: boolean;
  network?: string;
  error?: WalletErrorCode;
}

export type WalletErrorCode =
  | "WALLET_NOT_DETECTED"
  | "ACCESS_REQUEST_FAILED"
  | "ACCESS_REQUEST_REJECTED"
  | "NETWORK_CHECK_FAILED"
  | "WRONG_NETWORK"
  | "BALANCE_FETCH_FAILED"
  | "SIGNING_REJECTED"
  | "SIGNING_FAILED";

export const EXPECTED_NETWORK = "TESTNET";

interface FreighterIsAvailable {
  isAvailable: () => Promise<boolean>;
}

interface FreighterRequestAccess {
  requestAccess: () => Promise<{ address: string; error?: unknown }>;
}

interface FreighterGetNetwork {
  getNetwork: () => Promise<{ network: string; error?: unknown }>;
}

interface FreighterGetAddress {
  getAddress: () => Promise<{ address: string; error?: unknown }>;
}

/**
 * Narrow the global window object down to the injected Freighter API.
 * Using a structural probe instead of a direct import keeps the app
 * renderable (with guidance UI) when the extension is absent.
 */
function freighterApi(): FreighterIsAvailable &
  FreighterRequestAccess &
  FreighterGetNetwork &
  FreighterGetAddress | null {
  if (typeof window === "undefined") return null;
  const candidate = (
    window as unknown as {
      freighter?: Partial<
        FreighterIsAvailable & FreighterRequestAccess & FreighterGetNetwork & FreighterGetAddress
      >;
    }
  ).freighter;
  if (!candidate) return null;
  return candidate as FreighterIsAvailable &
    FreighterRequestAccess &
    FreighterGetNetwork &
    FreighterGetAddress;
}

export function isWalletInstalled(): boolean {
  return freighterApi() !== null;
}

export async function connectWallet(): Promise<WalletConnectionResult> {
  const api = freighterApi();
  if (!api) {
    return { ok: false, error: "WALLET_NOT_DETECTED" };
  }

  try {
    const access = await api.requestAccess();
    if (!access || !access.address || access.error) {
      return { ok: false, error: "ACCESS_REQUEST_REJECTED" };
    }
    return { ok: true, publicKey: access.address };
  } catch {
    // Freighter throws when the user dismisses the access prompt.
    return { ok: false, error: "ACCESS_REQUEST_REJECTED" };
  }
}

export async function checkNetwork(): Promise<NetworkCheckResult> {
  const api = freighterApi();
  if (!api) {
    return { ok: false, error: "WALLET_NOT_DETECTED" };
  }
  try {
    const { network } = await api.getNetwork();
    if (network !== EXPECTED_NETWORK) {
      return { ok: false, network, error: "WRONG_NETWORK" };
    }
    return { ok: true, network };
  } catch {
    return { ok: false, error: "NETWORK_CHECK_FAILED" };
  }
}

export async function getActivePublicKey(): Promise<string | null> {
  const api = freighterApi();
  if (!api) return null;
  try {
    const { address } = await api.getAddress();
    return address ?? null;
  } catch {
    return null;
  }
}

export async function signTransaction(
  transactionXdr: string,
): Promise<
  | { ok: true; signedXdr: string }
  | { ok: false; code: WalletErrorCode }
> {
  const api = freighterApi() as unknown as {
    signTransaction?: (
      xdr: string,
      opts?: Record<string, unknown>,
    ) => Promise<{ signedTxXdr?: string; signedTransaction?: string; error?: unknown }>;
  } | null;
  if (!api || typeof api.signTransaction !== "function") {
    return { ok: false, code: "WALLET_NOT_DETECTED" };
  }
  try {
    const result = await api.signTransaction(transactionXdr, {
      networkPassphrase: "Test SDF Network ; September 2015",
    });
    const signed = result?.signedTxXdr ?? result?.signedTransaction;
    if (!signed || result?.error) {
      return { ok: false, code: "SIGNING_REJECTED" };
    }
    return { ok: true, signedXdr: signed };
  } catch {
    return { ok: false, code: "SIGNING_REJECTED" };
  }
}

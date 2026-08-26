/**
 * Typed wrapper around the official @stellar/freighter-api package.
 *
 * Every method maps Freighter 4.x result-object responses into a small,
 * explicit result type so the UI never parses raw SDK payloads. Detection
 * uses the official isConnected() call (which itself consults the injected
 * window.freighter flag and the extension messaging bridge) instead of a
 * fragile synchronous window.freighter probe.
 */

import { getAddress, getNetwork, isConnected, isAllowed } from "@stellar/freighter-api";

export type WalletErrorCode =
  | "WALLET_NOT_DETECTED"
  | "WALLET_DETECTING"
  | "WALLET_LOCKED"
  | "ACCESS_NOT_GRANTED"
  | "ACCESS_REQUEST_REJECTED"
  | "ACCESS_REQUEST_FAILED"
  | "NETWORK_CHECK_FAILED"
  | "WRONG_NETWORK"
  | "BALANCE_FETCH_FAILED"
  | "SIGNING_REJECTED"
  | "SIGNING_FAILED";

export const EXPECTED_NETWORK = "TESTNET";

/** Bounded window during which we re-poll for late extension injection. */
export const DETECTION_TIMEOUT_MS = 8000;
export const DETECTION_INTERVAL_MS = 250;

export interface DetectionResult {
  status: "detected" | "detecting" | "unavailable";
}

/**
 * Poll for the Freighter extension using the official isConnected() API.
 * Injection is asynchronous in Chrome, so availability is re-checked on an
 * interval until it appears or the bounded timeout elapses. Never loops
 * forever: the deadline always wins.
 */
export async function waitForFreighter(
  timeoutMs: number = DETECTION_TIMEOUT_MS,
  intervalMs: number = DETECTION_INTERVAL_MS,
): Promise<DetectionResult> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      const result = await isConnected();
      // Freighter 4.x returns { isConnected: boolean; error? }.
      if (!result.error && result.isConnected === true) {
        return { status: "detected" };
      }
    } catch {
      // Treat transient messaging failures as "not ready yet".
    }

    if (Date.now() >= deadline) {
      return { status: "unavailable" };
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export interface WalletConnectionResult {
  ok: boolean;
  publicKey?: string;
  error?: WalletErrorCode;
}

/**
 * Request access on an explicit user action. Freighter 4.x returns
 * { address, error? } — a rejected prompt surfaces as an error object
 * (or a thrown rejection), not as a thrown typed exception.
 */
export async function connectWallet(): Promise<WalletConnectionResult> {
  try {
    const access = await import("@stellar/freighter-api").then((m) => m.requestAccess());
    if (access.error) {
      return { ok: false, error: "ACCESS_REQUEST_REJECTED" };
    }
    if (!access.address) {
      // Empty address with no error: the wallet is locked or the prompt was
      // dismissed before any account could be resolved.
      return { ok: false, error: "WALLET_LOCKED" };
    }
    return { ok: true, publicKey: access.address };
  } catch {
    // requestAccess rejects when messaging fails outright.
    return { ok: false, error: "ACCESS_REQUEST_FAILED" };
  }
}

export interface NetworkCheckResult {
  ok: boolean;
  network?: string;
  error?: WalletErrorCode;
}

/** Verify the active Freighter network is Stellar Testnet. */
export async function checkNetwork(): Promise<NetworkCheckResult> {
  try {
    const result = await getNetwork();
    if (result.error) {
      return { ok: false, error: "NETWORK_CHECK_FAILED" };
    }
    if (result.network !== EXPECTED_NETWORK) {
      return { ok: false, network: result.network, error: "WRONG_NETWORK" };
    }
    return { ok: true, network: result.network };
  } catch {
    return { ok: false, error: "NETWORK_CHECK_FAILED" };
  }
}

/**
 * Resume an existing grant without prompting. Returns null when there is
 * nothing to resume (not granted, locked, or transiently unavailable).
 */
export async function getActivePublicKey(): Promise<
  { address: string } | { error: WalletErrorCode } | null
> {
  try {
    const allowed = await isAllowed();
    if (!allowed.error && allowed.isAllowed === true) {
      const result = await getAddress();
      if (!result.error && result.address) {
        return { address: result.address };
      }
      if (result.error) {
        return { error: "WALLET_LOCKED" };
      }
      return null;
    }
    if (allowed.error) {
      return { error: "WALLET_DETECTING" };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Sign a transaction with the Testnet passphrase. Freighter 4.x returns
 * { signedTxXdr, signerAddress, error? }; user dismissal surfaces as an
 * error object or a thrown rejection.
 */
export async function signTransaction(
  transactionXdr: string,
): Promise<{ ok: true; signedXdr: string } | { ok: false; code: WalletErrorCode }> {
  try {
    const result = await import("@stellar/freighter-api").then((m) =>
      m.signTransaction(transactionXdr, {
        networkPassphrase: "Test SDF Network ; September 2015",
      }),
    );
    if (result.error || !result.signedTxXdr) {
      return { ok: false, code: "SIGNING_REJECTED" };
    }
    return { ok: true, signedXdr: result.signedTxXdr };
  } catch {
    return { ok: false, code: "SIGNING_REJECTED" };
  }
}



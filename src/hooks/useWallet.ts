import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkNetwork,
  connectWallet,
  getActivePublicKey,
  waitForFreighter,
  type WalletErrorCode,
} from "../services/freighter";
import { fetchXlmBalance } from "../services/horizon";

export type WalletPhase =
  | "detecting"
  | "unavailable"
  | "disconnected"
  | "connecting"
  | "connected";

export interface WalletState {
  phase: WalletPhase;
  installed: boolean;
  publicKey: string | null;
  networkOk: boolean | null;
  connecting: boolean;
  connectionError: WalletErrorCode | null;
  balance: string | null;
  balanceLoading: boolean;
  balanceError: string | null;
}

export interface WalletActions {
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
  retryNetworkCheck: () => Promise<void>;
  recheckWallet: () => void;
}

/**
 * Owns the Freighter lifecycle. Installation is resolved asynchronously
 * through the official API with a bounded retry window, so a late content
 * script injection never gets misread as "no wallet installed". The phase
 * stays "detecting" (never "unavailable") until the deadline passes.
 */
export function useWallet(): WalletState & WalletActions {
  const [phase, setPhase] = useState<WalletPhase>("detecting");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [networkOk, setNetworkOk] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<WalletErrorCode | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  // Monotonic token so stale async work (StrictMode double-mount, retries,
  // disconnect during flight) can never commit state after cancellation.
  const runIdRef = useRef(0);

  const refreshBalance = useCallback(async (key: string) => {
    setBalanceLoading(true);
    setBalanceError(null);
    const result = await fetchXlmBalance(key);
    if (result.ok && result.balance !== undefined) {
      setBalance(result.balance);
    } else if (result.error === "ACCOUNT_NOT_FOUND") {
      setBalance(null);
      setBalanceError(
        "This account is not funded yet. Request Testnet XLM from the friendbot faucet, then refresh.",
      );
    } else {
      setBalanceError(
        "Could not reach the Stellar Testnet to read your balance. Check your connection and try again.",
      );
    }
    setBalanceLoading(false);
  }, []);

  /** Load balance after the key/network pair becomes available. */
  const loadBalanceFor = useCallback(
    async (key: string, ok: boolean) => {
      if (ok && key) {
        await refreshBalance(key);
      } else {
        setBalance(null);
        setBalanceError(null);
      }
    },
    [refreshBalance],
  );

  const detectAndResume = useCallback(
    async (runId: number) => {
      setPhase("detecting");
      setConnectionError(null);
      const detection = await waitForFreighter();
      if (runIdRef.current !== runId) return;

      if (detection.status === "detected") {
        setPhase("disconnected");
        const existing = await getActivePublicKey();
        if (runIdRef.current !== runId) return;
        if (existing && "address" in existing) {
          const net = await checkNetwork();
          if (runIdRef.current !== runId) return;
          setPublicKey(existing.address);
          setNetworkOk(net.ok);
          await loadBalanceFor(existing.address, net.ok);
        }
      } else {
        setPhase("unavailable");
      }
    },
    [loadBalanceFor],
  );

  // Initial detection + resume of an existing grant. The cleanup only
  // invalidates in-flight work; re-running detection is idempotent, so a
  // StrictMode double-invoke converges instead of looping.
  useEffect(() => {
    runIdRef.current += 1;
    const runId = runIdRef.current;
    void detectAndResume(runId);
    return () => {
      runIdRef.current += 1;
    };
  }, [detectAndResume]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setConnectionError(null);

    const access = await connectWallet();
    if (!access.ok || !access.publicKey) {
      setConnectionError(access.error ?? "ACCESS_REQUEST_FAILED");
      setConnecting(false);
      return;
    }

    const net = await checkNetwork();
    setPublicKey(access.publicKey);
    setNetworkOk(net.ok);
    setPhase("connected");
    setConnecting(false);
    await loadBalanceFor(access.publicKey, net.ok);
  }, [loadBalanceFor]);

  /** Re-run the Testnet guard after the user switches networks. */
  const retryNetworkCheck = useCallback(async () => {
    const net = await checkNetwork();
    setNetworkOk(net.ok);
    await loadBalanceFor(publicKey ?? "", net.ok && publicKey !== null);
  }, [publicKey, loadBalanceFor]);

  const disconnect = useCallback(() => {
    runIdRef.current += 1; // invalidate any in-flight work
    setPublicKey(null);
    setNetworkOk(null);
    setBalance(null);
    setBalanceError(null);
    setConnectionError(null);
    setPhase("disconnected");
  }, []);

  /**
   * Manual recovery path: re-run detection after the user installs or
   * unlocks Freighter without needing a full application reload.
   */
  const recheckWallet = useCallback(() => {
    runIdRef.current += 1;
    const runId = runIdRef.current;
    void detectAndResume(runId);
  }, [detectAndResume]);

  return {
    phase,
    installed: phase !== "unavailable",
    publicKey,
    networkOk,
    connecting,
    connectionError,
    balance,
    balanceLoading,
    balanceError,
    connect,
    disconnect,
    refreshBalance: async () => {
      if (publicKey) {
        await refreshBalance(publicKey);
      }
    },
    retryNetworkCheck,
    recheckWallet,
  };
}

import { useCallback, useEffect, useState } from "react";
import {
  checkNetwork,
  connectWallet,
  getActivePublicKey,
  type WalletErrorCode,
} from "../services/freighter";
import { fetchXlmBalance } from "../services/horizon";

export interface WalletState {
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
}

function detectInstallation(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as { freighter?: unknown }).freighter);
}

/**
 * Owns the Freighter lifecycle: installation probe, access request,
 * Testnet verification, XLM balance retrieval, and disconnect cleanup.
 * The initial render decides installation synchronously so guidance UI
 * appears without a flash of wrong state.
 */
export function useWallet(): WalletState & WalletActions {
  const [installed] = useState(detectInstallation);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [networkOk, setNetworkOk] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<WalletErrorCode | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  // If the extension is present but the user already granted access in a
  // previous session, pick the session back up. All state updates happen
  // asynchronously after awaits, never synchronously in the effect body.
  useEffect(() => {
    let cancelled = false;
    async function resumeSession() {
      if (!detectInstallation()) {
        return;
      }
      const existingKey = await getActivePublicKey();
      if (cancelled) return;
      if (existingKey) {
        const net = await checkNetwork();
        if (cancelled) return;
        setPublicKey(existingKey);
        setNetworkOk(net.ok);
      }
    }
    void resumeSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshBalance = useCallback(
    async (key: string) => {
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
    },
    [],
  );

  /** Load balance after the key/network pair becomes available. */
  const loadBalanceFor = useCallback(
    async (key: string, ok: boolean) => {
      if (ok) {
        await refreshBalance(key);
      } else {
        setBalance(null);
        setBalanceError(null);
      }
    },
    [refreshBalance],
  );

  const connect = useCallback(async () => {
    setConnecting(true);
    setConnectionError(null);

    if (!detectInstallation()) {
      setConnecting(false);
      return;
    }

    const access = await connectWallet();
    if (!access.ok || !access.publicKey) {
      setConnectionError(access.error ?? "ACCESS_REQUEST_FAILED");
      setConnecting(false);
      return;
    }

    const net = await checkNetwork();
    setPublicKey(access.publicKey);
    setNetworkOk(net.ok);
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
    setPublicKey(null);
    setNetworkOk(null);
    setBalance(null);
    setBalanceError(null);
    setConnectionError(null);
  }, []);

  return {
    installed,
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
  };
}

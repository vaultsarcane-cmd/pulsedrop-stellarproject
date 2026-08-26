import { useCallback, useEffect, useState } from "react";
import {
  checkNetwork,
  connectWallet,
  getActivePublicKey,
  isWalletInstalled,
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
}

/**
 * Owns the Freighter lifecycle: installation probe, access request,
 * Testnet verification, XLM balance retrieval, and disconnect cleanup.
 */
export function useWallet(): WalletState & WalletActions {
  const [installed, setInstalled] = useState<boolean>(true);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [networkOk, setNetworkOk] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<WalletErrorCode | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  useEffect(() => {
    setInstalled(isWalletInstalled());
  }, []);

  // If the extension is present but the user already granted access in a
  // previous session, pick the session back up automatically.
  useEffect(() => {
    let cancelled = false;
    async function resumeSession() {
      if (!isWalletInstalled()) {
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

  const refreshBalance = useCallback(async () => {
    if (!publicKey) return;
    setBalanceLoading(true);
    setBalanceError(null);
    const result = await fetchXlmBalance(publicKey);
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
  }, [publicKey]);

  useEffect(() => {
    if (publicKey && networkOk) {
      void refreshBalance();
    }
  }, [publicKey, networkOk, refreshBalance]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setConnectionError(null);

    if (!isWalletInstalled()) {
      setInstalled(false);
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
  }, []);

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
    refreshBalance,
  };
}

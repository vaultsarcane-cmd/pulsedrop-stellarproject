import { useCallback, useEffect, useState } from "react";
import { Networks } from "@stellar/stellar-sdk";
import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";
import { fetchXlmBalance } from "./horizon";

const WALLET_OPTIONS = [
  { id: "freighter", label: "Freighter", installed: true },
  { id: "albedo", label: "Albedo", installed: true },
  { id: "xbull", label: "xBull", installed: true },
  { id: "rabet", label: "Rabet", installed: true },
  { id: "lobstr", label: "LOBSTR", installed: true },
] as const;
let initialized = false;
function ensureKit() {
  if (initialized) return;
  StellarWalletsKit.init({ modules: defaultModules() });
  StellarWalletsKit.setNetwork(Networks.TESTNET);
  initialized = true;
}

export interface ConnectedWallet { walletId: string; publicKey: string; label: string }
export interface WalletSelectorState {
  wallets: Array<{ id: string; label: string; installed: boolean }>;
  selectedId: string | null; connected: ConnectedWallet | null; connecting: boolean;
  error: string | null; walletUnavailable: boolean; accessRejected: boolean;
  signatureRejected: boolean; wrongNetwork: boolean; networkChecking: boolean;
  balance: string | null; balanceLoading: boolean; balanceError: string | null;
}
export interface WalletSelectorActions {
  selectWallet: (id: string) => void; connect: () => Promise<void>; disconnect: () => void;
  checkNetwork: () => Promise<boolean>; refreshBalance: () => Promise<void>;
  signTransaction: (tx: string) => Promise<{ signedTxXdr: string; signerAddress?: string }>;
}
function wasRejected(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause);
  return /reject|declin|cancel|dismiss|closed/i.test(message);
}

export function useWalletSelector(): WalletSelectorState & WalletSelectorActions {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connected, setConnected] = useState<ConnectedWallet | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessRejected, setAccessRejected] = useState(false);
  const [signatureRejected, setSignatureRejected] = useState(false);
  const [wrongNetwork, setWrongNetwork] = useState(false);
  const [networkChecking, setNetworkChecking] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  useEffect(() => { ensureKit(); }, []);

  const refreshBalance = useCallback(async () => {
    if (!connected) return;
    setBalanceLoading(true); setBalanceError(null);
    const result = await fetchXlmBalance(connected.publicKey);
    if (result.ok && result.balance !== undefined) setBalance(result.balance);
    else { setBalance(null); setBalanceError(result.error === "ACCOUNT_NOT_FOUND" ? "This Testnet account is not funded." : "Could not read the Testnet balance."); }
    setBalanceLoading(false);
  }, [connected]);
  useEffect(() => {
    if (connected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void refreshBalance();
    }
  }, [connected, refreshBalance]);

  const selectWallet = useCallback((id: string) => { setSelectedId(id); setError(null); setAccessRejected(false); }, []);
  const connect = useCallback(async () => {
    ensureKit(); setConnecting(true); setError(null); setAccessRejected(false);
    try {
      let address: string;
      if (selectedId) { StellarWalletsKit.setWallet(selectedId); ({ address } = await StellarWalletsKit.fetchAddress()); }
      else ({ address } = await StellarWalletsKit.authModal());
      const network = await StellarWalletsKit.getNetwork();
      const ok = network.networkPassphrase === Networks.TESTNET;
      setWrongNetwork(!ok);
      if (!ok) throw new Error("Wrong network — switch your wallet to Stellar Testnet.");
      const label = WALLET_OPTIONS.find((wallet) => wallet.id === selectedId)?.label ?? "Stellar Wallet";
      setConnected({ walletId: selectedId ?? "wallet-kit", publicKey: address, label });
    } catch (cause) {
      setAccessRejected(wasRejected(cause));
      setError(cause instanceof Error ? cause.message : "Wallet connection failed.");
    } finally { setConnecting(false); }
  }, [selectedId]);
  const disconnect = useCallback(() => {
    void StellarWalletsKit.disconnect(); setConnected(null); setSelectedId(null);
    setBalance(null); setError(null); setWrongNetwork(false);
  }, []);
  const checkNetwork = useCallback(async () => {
    setNetworkChecking(true);
    try { const network = await StellarWalletsKit.getNetwork(); const ok = network.networkPassphrase === Networks.TESTNET; setWrongNetwork(!ok); return ok; }
    catch { setWrongNetwork(true); return false; }
    finally { setNetworkChecking(false); }
  }, []);
  const signTransaction = useCallback(async (tx: string) => {
    try {
      const result = await StellarWalletsKit.signTransaction(tx, { networkPassphrase: Networks.TESTNET, address: connected?.publicKey });
      setSignatureRejected(false); return result;
    } catch (cause) { setSignatureRejected(wasRejected(cause)); throw cause; }
  }, [connected]);
  return {
    wallets: [...WALLET_OPTIONS], selectedId, connected, connecting, error,
    walletUnavailable: Boolean(error) && !accessRejected, accessRejected, signatureRejected,
    wrongNetwork, networkChecking, balance, balanceLoading, balanceError,
    selectWallet, connect, disconnect, checkNetwork, refreshBalance, signTransaction,
  };
}

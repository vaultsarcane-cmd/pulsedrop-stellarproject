import { useWalletSelector } from "./services/walletSelector";
import { useContract } from "./services/contract";
import type { SorobanEnv } from "./services/contract";
import { WalletCard } from "./components/WalletCard";
import { RequestForm } from "./components/RequestForm";
import { SyncPane } from "./components/SyncPane";
import { ReceiptCard } from "./components/ReceiptCard";
import { usePayment } from "./hooks/usePayment";
import { useState, useCallback } from "react";

const DEFAULT_ENV: SorobanEnv = {
  rpcUrl: import.meta.env.VITE_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org",
  contractId: import.meta.env.VITE_CONTRACT_ID ?? "CA67LHULSLWR6NNSUBVWSJTJOISRFSUZNPXGRIGN42DFDQEOQ5JCTGVX",
};

export default function App() {
  const wallet = useWalletSelector();
  const contract = useContract(DEFAULT_ENV, {
    publicKey: wallet.connected?.publicKey,
    signTransaction: wallet.signTransaction,
  });

  const payment = usePayment(wallet.connected?.publicKey ?? null, wallet.wrongNetwork === false);

  const connectedAndGuarded = wallet.connected != null && wallet.wrongNetwork === false;

  const [showContract, setShowContract] = useState(false);

  const handleCheckNetwork = useCallback(async () => {
    const ok = await wallet.checkNetwork();
    return ok;
  }, [wallet]);

  const handleFundRequest = useCallback(
    (id: number) => {
      if (!wallet.connected || !contract) return;
      payment.sendPaymentResult?.({ status: "pending", hash: null, explorerUrl: null, message: "Submitting contract transaction…" });
      void contract.fundRequest(wallet.connected.publicKey, id).then((result) => {
        if (result.ok) {
          payment.sendPaymentResult?.({
            status: "success",
            hash: result.hash ?? null,
            explorerUrl: result.hash ? `https://stellar.expert/explorer/testnet/tx/${result.hash}` : null,
            message: "Request marked as funded on the Stellar Testnet.",
          });
        } else {
          payment.sendPaymentResult?.({
            status: "failure",
            hash: null,
            explorerUrl: null,
            message: result.error ?? "Failed to mark request as funded.",
          });
        }
      });
    },
    [wallet.connected, contract, payment],
  );

  const handleCancelRequest = useCallback(
    (id: number) => {
      if (!wallet.connected || !contract) return;
      payment.sendPaymentResult?.({ status: "pending", hash: null, explorerUrl: null, message: "Submitting contract transaction…" });
      void contract.cancelRequest(wallet.connected.publicKey, id).then((result) => {
        if (result.ok) {
          payment.sendPaymentResult?.({
            status: "success",
            hash: result.hash ?? null,
            explorerUrl: result.hash ? `https://stellar.expert/explorer/testnet/tx/${result.hash}` : null,
            message: "Request cancelled on the Stellar Testnet.",
          });
        } else {
          payment.sendPaymentResult?.({
            status: "failure",
            hash: null,
            explorerUrl: null,
            message: result.error ?? "Failed to cancel request.",
          });
        }
      });
    },
    [wallet.connected, contract, payment],
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-row">
          <svg
            className="pulse-mark"
            viewBox="0 0 34 34"
            role="img"
            aria-label="PulseDrop logo"
          >
            <polyline
              points="2,17 9,17 13,6 18,28 22,12 25,17 32,17"
              fill="none"
              stroke="var(--pd-lime)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <h1 className="brand-title">PulseDrop</h1>
        </div>
        <p className="tagline">
          Rapid Stellar Testnet assistance payments. Pick an urgent preset, send
          XLM in seconds.
        </p>
      </header>

      <main id="main" className="section-stack">
        <WalletCard
          wallet={wallet}
          onRefreshBalance={wallet.refreshBalance}
          onCheckNetwork={handleCheckNetwork}
          onSelectContractAction={() => setShowContract((v) => !v)}
        />

        {showContract && connectedAndGuarded && (
          <>
            <RequestForm
              creatorPublicKey={wallet.connected!.publicKey}
              networkOk={wallet.wrongNetwork === false}
              contract={contract}
              onFundRequest={handleFundRequest}
              onCancelRequest={handleCancelRequest}
            />
            <SyncPane
              contractEnv={DEFAULT_ENV}
              creatorPublicKey={wallet.connected!.publicKey}
              networkOk={wallet.wrongNetwork === false}
              onResync={() => {
                setShowContract(false);
                setTimeout(() => setShowContract(true), 50);
              }}
            />
          </>
        )}

        <ReceiptCard receipt={payment.receipt} onDismiss={payment.reset} />
      </main>
    </div>
  );
}

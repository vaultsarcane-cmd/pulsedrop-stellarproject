import { useWalletSelector } from "./services/walletSelector";
import { useContract } from "./services/contract";
import type { SorobanEnv } from "./services/contract";
import { WalletCard } from "./components/WalletCard";
import { RequestForm } from "./components/RequestForm";
import { SyncPane } from "./components/SyncPane";
import { ReceiptCard } from "./components/ReceiptCard";
import { usePayment } from "./hooks/usePayment";
import { useCallback } from "react";

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
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <header className="app-header">
        <nav className="topbar" aria-label="Primary navigation">
          <div className="brand-row">
            <span className="brand-orbit" aria-hidden="true"><span /></span>
            <span className="brand-title">PulseDrop</span>
          </div>
          <div className="network-pill"><span /> Stellar Testnet</div>
        </nav>
        <div className="hero-grid">
          <div className="hero-copy">
            <div className="eyebrow"><span>01</span> Live assistance protocol</div>
            <h1 className="hero-title">Help moves<br /><em>at light speed.</em></h1>
            <p className="tagline">Create transparent assistance requests, fund urgent needs and watch every pulse settle on Stellar.</p>
            <div className="hero-meta">
              <div><strong>~5s</strong><span>settlement</span></div>
              <div><strong>Live</strong><span>contract events</span></div>
              <div><strong>Multi</strong><span>wallet ready</span></div>
            </div>
          </div>
          <div className="pulse-visual" aria-hidden="true">
            <div className="pulse-core"><span className="drop-glyph">P</span></div>
            <div className="orbit orbit-a"><i /></div>
            <div className="orbit orbit-b"><i /></div>
            <svg viewBox="0 0 420 170" className="wave-line"><path d="M0 90 C50 90 55 90 82 90 L102 90 L120 24 L148 146 L174 62 L194 90 C238 90 270 90 420 90" /></svg>
            <span className="visual-label label-a">SIGNAL / ACTIVE</span>
            <span className="visual-label label-b">LEDGER SYNC</span>
          </div>
        </div>
      </header>

      <main id="main" className="section-stack">
        <WalletCard
          wallet={wallet}
          onRefreshBalance={wallet.refreshBalance}
          onCheckNetwork={handleCheckNetwork}
          onSelectContractAction={() => document.getElementById("contract-workspace")?.scrollIntoView({ behavior: "smooth" })}
        />

        {connectedAndGuarded ? (
          <div id="contract-workspace" className="workspace-grid">
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
              onResync={() => window.location.reload()}
            />
          </div>
        ) : (
          <section className="locked-workspace">
            <span className="locked-number">02</span>
            <div><p className="section-kicker">Contract workspace</p><h2>Connect. Create. Make impact.</h2><p>Your live request studio unlocks after a Testnet wallet is connected.</p></div>
            <div className="locked-pulse" aria-hidden="true"><span /><span /><span /></div>
          </section>
        )}

        <ReceiptCard receipt={payment.receipt} onDismiss={payment.reset} />
      </main>
      <footer className="app-footer"><span>PulseDrop / Soroban</span><span>Built on Stellar · Testnet only</span></footer>
    </div>
  );
}

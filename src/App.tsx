import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/components.css";
import "./styles/payment.css";
import { useWallet } from "./hooks/useWallet";
import { usePayment } from "./hooks/usePayment";
import { WalletCard } from "./components/WalletCard";
import { PaymentForm } from "./components/PaymentForm";
import { ReceiptCard } from "./components/ReceiptCard";

export default function App() {
  const wallet = useWallet();
  const payment = usePayment(wallet.publicKey, wallet.networkOk);

  const connectedAndGuarded = Boolean(wallet.publicKey) && wallet.networkOk === true;
  const formLocked = !connectedAndGuarded || payment.receipt.status !== "idle";

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
        <WalletCard wallet={wallet} onRefreshBalance={() => void wallet.refreshBalance()} />
        <PaymentForm
          balance={wallet.balance}
          disabled={formLocked}
          onSubmit={(destination, amount) => void payment.sendPayment(destination, amount)}
        />
        <ReceiptCard receipt={payment.receipt} onDismiss={payment.reset} />
      </main>
    </div>
  );
}

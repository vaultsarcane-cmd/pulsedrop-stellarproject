import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/components.css";
import { useWallet } from "./hooks/useWallet";
import { WalletCard } from "./components/WalletCard";

export default function App() {
  const wallet = useWallet();

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
      </main>
    </div>
  );
}

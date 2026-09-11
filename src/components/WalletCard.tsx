import { useWalletSelector } from "../services/walletSelector";

export interface WalletCardProps {
  wallet?: ReturnType<typeof useWalletSelector>;
  onRefreshBalance: () => Promise<void>;
  onCheckNetwork: () => Promise<boolean>;
  onSelectContractAction: () => void;
}

export function WalletCard({
  wallet,
  onRefreshBalance,
  onCheckNetwork,
  onSelectContractAction,
}: WalletCardProps) {
  const fallbackWallet = useWalletSelector();
  const state = wallet ?? fallbackWallet;
  return (
    <section className="wallet-card" aria-labelledby="wallet-card-title">
      <h2 id="wallet-card-title" className="wallet-card-title">
        Wallet
      </h2>

      {state.connected ? (
        <div className="wallet-connected">
          <div className="wallet-identity">
            <span
              className="wallet-mark"
              aria-hidden="true"
              style={{ background: "var(--pd-lime)" }}
            />
            <span className="wallet-key-label">Connected via</span>
            <span className="wallet-name">{state.connected.label}</span>
            <button
              className="wallet-copy-btn"
              onClick={() => {
                if (state.connected?.publicKey) {
                  navigator.clipboard.writeText(state.connected.publicKey);
                }
              }}
              aria-label="Copy public key"
            >
              Copy key
            </button>
          </div>
          <div className="wallet-key-wrap">
            <code className="wallet-key">{state.connected.publicKey}</code>
          </div>

          <div className="wallet-balance-row">
            <button className="btn btn-ghost btn-sm" onClick={onRefreshBalance}>
              Refresh balance
            </button>
            {state.balance !== null ? (
              <span className="wallet-balance">{state.balance} XLM</span>
            ) : (
              <span className="wallet-balance-placeholder">—</span>
            )}
          </div>

          <div className="wallet-network-row">
            <span className={`network-badge ${state.wrongNetwork ? "bad" : "ok"}`}>
              {state.wrongNetwork ? "Wrong network" : "Testnet OK"}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => void onCheckNetwork()}
              disabled={state.networkChecking}
            >
              {state.networkChecking ? "Checking…" : "Check network"}
            </button>
          </div>

          <div className="wallet-actions">
            <button className="btn btn-ghost" onClick={onSelectContractAction}>
              Use contract
            </button>
            <button className="btn btn-ghost" onClick={state.disconnect}>
              Disconnect
            </button>
          </div>
        </div>
      ) : state.walletUnavailable ? (
        <div className="wallet-bad">
          <p className="wallet-bad-text">{state.error ?? "Wallet unavailable"}</p>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => void state.selectWallet("freighter")}
          >
            Try Freighter
          </button>
        </div>
      ) : state.accessRejected ? (
        <div className="wallet-bad">
          <p className="wallet-bad-text">Access was rejected. Nothing was sent.</p>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => void state.selectWallet("freighter")}
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="wallet-picker">
          <p className="wallet-picker-hint">Choose a wallet to connect:</p>
          <ul className="wallet-list" role="listbox" aria-label="Stellar wallets">
            {state.wallets.map((w) => (
              <li
                key={w.id}
                className={`wallet-list-item ${state.selectedId === w.id ? "selected" : ""}`}
                role="option"
                aria-selected={state.selectedId === w.id}
              >
                <button
                  className="wallet-list-btn"
                  onClick={() => state.selectWallet(w.id)}
                  disabled={false}
                >
                  <span
                    className="wallet-list-mark"
                    aria-hidden="true"
                    style={{ background: "var(--pd-lime)" }}
                  />
                  <span className="wallet-list-name">{w.label}</span>
                  {!w.installed ? (
                    <span className="wallet-list-status wallet-list-missing">
                      Not installed
                    </span>
                  ) : (
                    <span className="wallet-list-status wallet-list-ready">
                      Ready
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {state.selectedId && (
            <div className="wallet-connect-row">
              {state.connecting ? (
                <span className="connect-status">Connecting…</span>
              ) : state.walletUnavailable ? (
                <span className="connect-status connect-bad">
                  {state.error ?? "Wallet unavailable"}
                </span>
              ) : state.accessRejected ? (
                <span className="connect-status connect-bad">
                  Access was rejected. Nothing was sent.
                </span>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={() => void state.connect()}
                  disabled={state.connecting}
                >
                  Connect
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

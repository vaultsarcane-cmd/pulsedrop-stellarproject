import { abbreviatePublicKey, formatXlmAmount } from "../lib/format";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import type { useWallet } from "../hooks/useWallet";

type WalletApi = ReturnType<typeof useWallet>;

interface WalletCardProps {
  wallet: WalletApi;
  onRefreshBalance: () => void;
}

const WALLET_ERROR_MESSAGES: Record<string, string> = {
  WALLET_NOT_DETECTED:
    "No Stellar wallet detected. Install the Freighter extension from freighter.app and reload this page.",
  ACCESS_REQUEST_REJECTED:
    "Connection request was dismissed. Click Connect again when you are ready to grant access.",
  ACCESS_REQUEST_FAILED:
    "Freighter did not answer the connection request. Make sure the extension is unlocked and try again.",
  NETWORK_CHECK_FAILED:
    "Could not confirm which network Freighter is using. Open the extension and verify it is set to Testnet.",
};

/**
 * Shows connection controls, network status, the abbreviated public key
 * with a copy action, and the live XLM balance.
 */
export function WalletCard({ wallet, onRefreshBalance }: WalletCardProps) {
  const { copied, copy } = useCopyToClipboard();

  if (!wallet.installed) {
    return (
      <section className="card" aria-labelledby="wallet-heading">
        <h2 className="card-title" id="wallet-heading">
          Wallet
        </h2>
        <p className="notice notice-warn" role="status">
          No Stellar wallet detected in this browser.
        </p>
        <p>
          PulseDrop sends real Testnet XLM, so a wallet is required.{" "}
          <a href="https://www.freighter.app/" target="_blank" rel="noreferrer noopener">
            Install the Freighter extension
          </a>
          , create or import a Testnet account, then reload this page.
        </p>
      </section>
    );
  }

  if (!wallet.publicKey) {
    return (
      <section className="card" aria-labelledby="wallet-heading">
        <h2 className="card-title" id="wallet-heading">
          Wallet
        </h2>
        <p style={{ marginTop: 0 }}>
          Connect Freighter to pick an urgent preset and send Testnet XLM.
        </p>
        {wallet.connectionError && (
          <p className="notice notice-danger" role="alert">
            {WALLET_ERROR_MESSAGES[wallet.connectionError] ??
              "Something went wrong while connecting. Please try again."}
          </p>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void wallet.connect()}
          disabled={wallet.connecting}
        >
          {wallet.connecting ? "Connecting..." : "Connect Freighter"}
        </button>
      </section>
    );
  }

  const balanceLabel = wallet.balanceLoading
    ? "Reading balance..."
    : wallet.balanceError
      ? "Balance unavailable"
      : `${formatXlmAmount(wallet.balance ?? "0")} XLM`;

  return (
    <section className="card" aria-labelledby="wallet-heading">
      <h2 className="card-title" id="wallet-heading">
        Wallet connected
      </h2>

      {!wallet.networkOk && (
        <div className="notice notice-warn" role="alert">
          <strong>Wrong network.</strong> Freighter is not set to Testnet. Open the
          extension, switch the network to <em>Test Network</em>, then press Retry
          below. Payments stay locked until the Testnet guard passes.
        </div>
      )}

      <dl className="kv-grid">
        <div>
          <dt>Public key</dt>
          <dd>
            <code>{abbreviatePublicKey(wallet.publicKey)}</code>
            <button
              type="button"
              className="btn btn-ghost btn-copy"
              onClick={() => void copy(wallet.publicKey ?? "")}
              aria-label="Copy full public key to clipboard"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </dd>
        </div>
        <div>
          <dt>XLM balance</dt>
          <dd>
            <span className="balance-value">{balanceLabel}</span>
          </dd>
        </div>
        <div>
          <dt>Network</dt>
          <dd>
            {wallet.networkOk === null
              ? "Checking..."
              : wallet.networkOk
                ? "Stellar Testnet"
                : "Unexpected network"}
          </dd>
        </div>
      </dl>

      <div className="row-gap">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onRefreshBalance}
          disabled={wallet.balanceLoading}
        >
          {wallet.balanceLoading ? "Refreshing..." : "Refresh balance"}
        </button>
        {!wallet.networkOk && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void wallet.retryNetworkCheck()}
          >
            Retry Testnet check
          </button>
        )}
        <button type="button" className="btn btn-danger" onClick={wallet.disconnect}>
          Disconnect
        </button>
      </div>

      {wallet.balanceError && (
        <p className="notice notice-warn" role="status" style={{ marginBottom: 0 }}>
          {wallet.balanceError}
        </p>
      )}
    </section>
  );
}

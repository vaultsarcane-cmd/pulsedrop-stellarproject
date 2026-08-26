import type { PaymentReceiptState } from "../hooks/usePayment";

interface ReceiptCardProps {
  receipt: PaymentReceiptState;
  onDismiss: () => void;
}

/**
 * Pending / success / failure receipt with hash and explorer link.
 * Success links to Stellar Expert (Testnet) so the payment is independently
 * verifiable.
 */
export function ReceiptCard({ receipt, onDismiss }: ReceiptCardProps) {
  if (receipt.status === "idle") return null;

  return (
    <section
      className="card receipt-card"
      aria-live="polite"
      aria-labelledby="receipt-heading"
    >
      <h2 className="card-title" id="receipt-heading">
        Payment receipt
      </h2>

      {receipt.status === "pending" && (
        <div className="notice notice-warn">
          <span className="spinner" aria-hidden="true" /> Submitting your payment to
          the Stellar Testnet... Do not close this page.
        </div>
      )}

      {receipt.status === "success" && (
        <>
          <div className="notice notice-success">{receipt.message}</div>
          <dl className="kv-grid" style={{ marginTop: "var(--pd-space-4)" }}>
            <div>
              <dt>Transaction hash</dt>
              <dd>
                <code className="hash-code">{receipt.hash}</code>
              </dd>
            </div>
            <div>
              <dt>Verify on explorer</dt>
              <dd>
                <a href={receipt.explorerUrl ?? "#"} target="_blank" rel="noreferrer noopener">
                  Open in Stellar Expert
                </a>
              </dd>
            </div>
          </dl>
          <button type="button" className="btn btn-secondary" onClick={onDismiss}>
            Send another assistance payment
          </button>
        </>
      )}

      {receipt.status === "failure" && (
        <>
          <div className="notice notice-danger" role="alert">
            {receipt.message}
          </div>
          <button type="button" className="btn btn-secondary" onClick={onDismiss}>
            Back to payment form
          </button>
        </>
      )}
    </section>
  );
}

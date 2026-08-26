import { useCallback, useRef, useState } from "react";
import { signTransaction } from "../services/freighter";
import {
  buildPayment,
  submitSignedTransaction,
  STELLAR_EXPERT_TX_BASE,
} from "../services/horizon";

export type PaymentStatus = "idle" | "pending" | "success" | "failure";

export interface PaymentReceiptState {
  status: PaymentStatus;
  hash: string | null;
  explorerUrl: string | null;
  message: string | null;
}

const INITIAL_STATE: PaymentReceiptState = {
  status: "idle",
  hash: null,
  explorerUrl: null,
  message: null,
};

export interface PaymentApi {
  receipt: PaymentReceiptState;
  sendPayment: (destination: string, amount: string) => Promise<void>;
  reset: () => void;
}

/**
 * Drives the full XLM Testnet payment lifecycle.
 * A module-level ref guards against duplicate submissions while a
 * transaction is still pending.
 */
export function usePayment(
  sourcePublicKey: string | null,
  networkOk: boolean | null,
): PaymentApi {
  const [receipt, setReceipt] = useState<PaymentReceiptState>(INITIAL_STATE);
  const inFlightRef = useRef(false);

  const sendPayment = useCallback(
    async (destination: string, amount: string) => {
      if (!sourcePublicKey || networkOk !== true) return;
      if (inFlightRef.current) return; // duplicate-click guard
      inFlightRef.current = true;

      setReceipt({ status: "pending", hash: null, explorerUrl: null, message: null });

      const built = await buildPayment(sourcePublicKey, destination, amount);
      if (!built.ok || !built.xdr) {
        setReceipt({
          status: "failure",
          hash: null,
          explorerUrl: null,
          message:
            "The transaction could not be built. Confirm the recipient address is a funded Testnet account and try again.",
        });
        inFlightRef.current = false;
        return;
      }

      const signed = await signTransaction(built.xdr);
      if (!signed.ok) {
        setReceipt({
          status: "failure",
          hash: null,
          explorerUrl: null,
          message:
            signed.code === "SIGNING_REJECTED"
              ? "Signing was dismissed in Freighter. Nothing was sent; you can review the details and try again."
              : "Freighter could not sign this transaction. Unlock the extension and retry.",
        });
        inFlightRef.current = false;
        return;
      }

      const submitted = await submitSignedTransaction(signed.signedXdr);
      if (submitted.ok && submitted.hash) {
        setReceipt({
          status: "success",
          hash: submitted.hash,
          explorerUrl: `${STELLAR_EXPERT_TX_BASE}/${submitted.hash}`,
          message: "Assistance sent successfully on the Stellar Testnet.",
        });
      } else {
        setReceipt({
          status: "failure",
          hash: null,
          explorerUrl: null,
          message: describeSubmissionError(submitted.error ?? "SUBMISSION_FAILED"),
        });
      }
      inFlightRef.current = false;
    },
    [sourcePublicKey, networkOk],
  );

  const reset = useCallback(() => {
    setReceipt(INITIAL_STATE);
  }, []);

  return { receipt, sendPayment, reset };
}

function describeSubmissionError(code: string): string {
  switch (code) {
    case "INSUFFICIENT_BALANCE":
      return "The Stellar Testnet rejected this payment because the balance (minus the minimum reserve) cannot cover it. Send a smaller amount or top up from the friendbot faucet.";
    case "MALFORMED_TRANSACTION":
      return "The transaction was rejected as malformed before reaching the network. Check the amount format and recipient address.";
    default:
      return "The Testnet could not accept this transaction right now. This is usually temporary; please try again.";
  }
}

/**
 * Stellar Testnet Horizon operations: account balance lookup and
 * XLM payment submission. Kept separate from wallet code so each
 * concern stays independently testable.
 */
import {
  Asset,
  Horizon,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

export const TESTNET_HORIZON_URL = "https://horizon-testnet.stellar.org";
export const TESTNET_NETWORK_PASSPHRASE = Networks.TESTNET;
export const STELLAR_EXPERT_TX_BASE = "https://stellar.expert/explorer/testnet/tx";

const server = new Horizon.Server(TESTNET_HORIZON_URL);

export interface XlmBalanceResult {
  ok: boolean;
  balance?: string;
  error?: "ACCOUNT_NOT_FOUND" | "HORIZON_ERROR";
}

/** Return the native XLM balance of an account, or a typed failure. */
export async function fetchXlmBalance(publicKey: string): Promise<XlmBalanceResult> {
  try {
    const account = await server.loadAccount(publicKey);
    const native = account.balances.find((b) => b.asset_type === "native");
    if (!native) {
      return { ok: false, error: "ACCOUNT_NOT_FOUND" };
    }
    return { ok: true, balance: native.balance };
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status;
    if (status === 404) {
      return { ok: false, error: "ACCOUNT_NOT_FOUND" };
    }
    return { ok: false, error: "HORIZON_ERROR" };
  }
}

export interface PaymentBuildResult {
  ok: boolean;
  xdr?: string;
  error?: "INVALID_DESTINATION" | "BUILD_FAILED";
}

/** Build an unsigned XLM payment transaction and return its XDR envelope. */
export async function buildPayment(
  sourcePublicKey: string,
  destinationPublicKey: string,
  amount: string,
): Promise<PaymentBuildResult> {
  try {
    const sourceAccount = await server.loadAccount(sourcePublicKey);
    const fee = await server.fetchBaseFee();
    const transaction = new TransactionBuilder(sourceAccount, {
      fee: fee.toString(),
      networkPassphrase: TESTNET_NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.payment({
          destination: destinationPublicKey,
          asset: Asset.native(),
          amount,
        }),
      )
      .setTimeout(180)
      .build();
    return { ok: true, xdr: transaction.toXDR() };
  } catch {
    return { ok: false, error: "BUILD_FAILED" };
  }
}

export type SubmitErrorCode =
  | "SUBMISSION_FAILED"
  | "INSUFFICIENT_BALANCE"
  | "MALFORMED_TRANSACTION";

export interface SubmitResult {
  ok: boolean;
  hash?: string;
  error?: SubmitErrorCode;
}

/**
 * Submit a signed transaction envelope to the Testnet Horizon server.
 * Distinguishes insufficient-balance failures from generic submission
 * errors so the UI can show precise guidance.
 */
export async function submitSignedTransaction(
  signedXdr: string,
): Promise<SubmitResult> {
  try {
    const transaction = TransactionBuilder.fromXDR(signedXdr, TESTNET_NETWORK_PASSPHRASE);
    const response = await server.submitTransaction(transaction);
    return { ok: true, hash: response.hash };
  } catch (err) {
    const operational =
      (
        err as {
          response?: { data?: { extras?: { result_codes?: { transaction?: string } } } };
        }
      ).response?.data?.extras?.result_codes?.transaction ?? "";
    if (operational === "tx_insufficient_balance") {
      return { ok: false, error: "INSUFFICIENT_BALANCE" };
    }
    if (operational === "tx_malformed") {
      return { ok: false, error: "MALFORMED_TRANSACTION" };
    }
    return { ok: false, error: "SUBMISSION_FAILED" };
  }
}

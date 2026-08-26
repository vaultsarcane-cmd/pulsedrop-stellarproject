/**
 * Urgent assistance payment presets.
 * Each preset is a real-world micro-emergency with a suggested amount;
 * users can override the amount in custom mode before sending.
 */

export interface AssistancePreset {
  id: string;
  label: string;
  description: string;
  suggestedAmount: string;
  icon: string;
}

export const ASSISTANCE_PRESETS: readonly AssistancePreset[] = [
  {
    id: "transit",
    label: "Transit",
    description: "Bus or train fare to get somewhere safe tonight.",
    suggestedAmount: "5",
    icon: "\u{1F68C}",
  },
  {
    id: "mobile-data",
    label: "Mobile Data",
    description: "A data top-up so the person stays reachable.",
    suggestedAmount: "2",
    icon: "\u{1F4F6}",
  },
  {
    id: "meal",
    label: "Meal",
    description: "One hot meal, sent directly to their wallet.",
    suggestedAmount: "8",
    icon: "\u{1F35C}",
  },
] as const;

export type PaymentMode = "preset" | "custom";

export interface PaymentValidationErrors {
  destination?: string;
  amount?: string;
}

/** Validate recipient address and amount; returns per-field messages. */
export function validatePaymentInput(
  destination: string,
  amount: string,
  balance: string | null,
): PaymentValidationErrors {
  const errors: PaymentValidationErrors = {};

  if (!isValidPublicKeyFormat(destination)) {
    errors.destination =
      "Enter a valid Stellar account address. It starts with G and is 56 characters long.";
  }

  const parsedAmount = Number.parseFloat(amount);
  if (amount.trim() === "" || Number.isNaN(parsedAmount)) {
    errors.amount = "Enter the XLM amount to send.";
  } else if (parsedAmount <= 0) {
    errors.amount = "The amount must be greater than zero.";
  } else if (parsedAmount > MAX_AMOUNT) {
    errors.amount = `The amount cannot exceed ${MAX_AMOUNT} XLM.`;
  } else if (hasMoreThanSevenDecimals(amount)) {
    errors.amount = "Stellar supports at most 7 decimal places for XLM.";
  } else if (balance !== null && !leavesFeeHeadroom(amount, balance)) {
    errors.amount =
      "This amount leaves nothing for the network fee. Send a smaller amount or fund the account first.";
  }

  return errors;
}

/** Typical Testnet base fee in stroops per operation (0.00001 XLM). */
const BASE_FEE_XLM = 0.00001;

/**
 * True when amount + base fee stays strictly below the current balance,
 * so submission cannot fail with tx_insufficient_balance.
 */
function leavesFeeHeadroom(amount: string, balance: string): boolean {
  const amountValue = Number.parseFloat(amount);
  const balanceValue = Number.parseFloat(balance);
  if (Number.isNaN(amountValue) || Number.isNaN(balanceValue)) return false;
  return amountValue + BASE_FEE_XLM < balanceValue;
}

export const MAX_AMOUNT = 1000;

function isValidPublicKeyFormat(value: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(value.trim());
}

function hasMoreThanSevenDecimals(value: string): boolean {
  const [, fraction = ""] = value.trim().split(".");
  return fraction.length > 7;
}

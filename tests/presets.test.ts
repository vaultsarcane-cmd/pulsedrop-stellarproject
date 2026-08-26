import { describe, it, expect } from "vitest";
import { ASSISTANCE_PRESETS, validatePaymentInput, MAX_AMOUNT } from "../src/lib/presets";
import { abbreviatePublicKey, formatXlmAmount, isValidStellarPublicKey } from "../src/lib/format";

describe("assistance presets", () => {
  it("exposes exactly three urgent presets", () => {
    expect(ASSISTANCE_PRESETS).toHaveLength(3);
  });

  it("uses positive numeric suggested amounts", () => {
    for (const preset of ASSISTANCE_PRESETS) {
      expect(Number.parseFloat(preset.suggestedAmount)).toBeGreaterThan(0);
    }
  });
});

describe("validatePaymentInput", () => {
  const validAddress = "GA7QYNF7SOWQXGLAV2CYQ5VGVPTJHAFKD7LYLQEMNXOCE2ZNO4BCTLDZ";

  it("rejects an empty recipient", () => {
    const errors = validatePaymentInput("", "5", "100");
    expect(errors.destination).toBeTruthy();
  });

  it("rejects a malformed recipient address", () => {
    const errors = validatePaymentInput("not-an-address", "5", "100");
    expect(errors.destination).toMatch(/valid Stellar account address/);
  });

  it("accepts a well-formed Stellar address", () => {
    const errors = validatePaymentInput(validAddress, "5", "100");
    expect(errors.destination).toBeUndefined();
  });

  it("rejects empty amounts", () => {
    const errors = validatePaymentInput(validAddress, "", "100");
    expect(errors.amount).toMatch(/Enter the XLM amount/);
  });

  it("rejects zero and negative amounts", () => {
    expect(validatePaymentInput(validAddress, "0", "100").amount).toBeTruthy();
    expect(validatePaymentInput(validAddress, "-3", "100").amount).toBeTruthy();
  });

  it("rejects amounts that would exceed the balance including fees", () => {
    const errors = validatePaymentInput(validAddress, "10", "10.00001");
    expect(errors.amount).toMatch(/network fee|smaller/i);
  });

  it("allows amounts strictly below the balance", () => {
    const errors = validatePaymentInput(validAddress, "9", "10");
    expect(errors.amount).toBeUndefined();
  });

  it("rejects more than seven decimal places", () => {
    const errors = validatePaymentInput(validAddress, "1.00000001", "100");
    expect(errors.amount).toMatch(/7 decimal places/);
  });

  it("caps absurd amounts", () => {
    const errors = validatePaymentInput(validAddress, String(MAX_AMOUNT + 1), null);
    expect(errors.amount).toMatch(/cannot exceed/);
  });
});

describe("format helpers", () => {
  it("abbreviates long public keys keeping both ends", () => {
    const key = "GA7QYNF7SOWQXGLAV2CYQ5VGVPTJHAFKD7LYLQEMNXOCE2ZNO4BCTLDZ";
    const abbreviated = abbreviatePublicKey(key);
    expect(abbreviated.startsWith("GA7Q")).toBe(true);
    expect(abbreviated.endsWith("TLDZ")).toBe(true);
    expect(abbreviated.length).toBeLessThan(key.length);
  });

  it("formats balances with locale grouping", () => {
    expect(formatXlmAmount("12345.6789000")).toBe("12,345.6789");
  });

  it("returns zero for unparseable balances instead of NaN", () => {
    expect(formatXlmAmount("not-a-number")).toBe("0");
  });

  it("recognizes valid public keys", () => {
    expect(
      isValidStellarPublicKey("GA7QYNF7SOWQXGLAV2CYQ5VGVPTJHAFKD7LYLQEMNXOCE2ZNO4BCTLDZ"),
    ).toBe(true);
    expect(isValidStellarPublicKey("GABC")).toBe(false);
    expect(isValidStellarPublicKey("")).toBe(false);
  });
});

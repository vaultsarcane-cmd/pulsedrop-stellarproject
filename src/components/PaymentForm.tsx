import { ASSISTANCE_PRESETS, validatePaymentInput, type PaymentMode } from "../lib/presets";
import { useState } from "react";

interface PaymentFormProps {
  balance: string | null;
  disabled: boolean;
  onSubmit: (destination: string, amount: string) => void;
}

/**
 * Urgent preset cards plus a custom amount mode.
 * Validation runs before the parent starts any signing flow.
 */
export function PaymentForm({ balance, disabled, onSubmit }: PaymentFormProps) {
  const [mode, setMode] = useState<PaymentMode>("preset");
  const [presetId, setPresetId] = useState<string>(ASSISTANCE_PRESETS[0].id);
  const [customAmount, setCustomAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [touched, setTouched] = useState(false);

  const selectedPreset = ASSISTANCE_PRESETS.find((p) => p.id === presetId) ?? ASSISTANCE_PRESETS[0];
  const effectiveAmount =
    mode === "preset" ? selectedPreset.suggestedAmount : customAmount;

  const errors = validatePaymentInput(destination, effectiveAmount, balance);
  const hasErrors = Object.keys(errors).length > 0;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (hasErrors || disabled) return;
    onSubmit(destination.trim(), effectiveAmount);
  }

  return (
    <form className="card" aria-labelledby="payment-heading" onSubmit={handleSubmit} noValidate>
      <h2 className="card-title" id="payment-heading">
        Send assistance
      </h2>

      <fieldset className="preset-fieldset">
        <legend className="field-label">Choose an urgent need</legend>
        <div className="preset-grid">
          {ASSISTANCE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`preset-card${mode === "preset" && presetId === preset.id ? " preset-card-active" : ""}`}
              aria-pressed={mode === "preset" && presetId === preset.id}
              onClick={() => {
                setMode("preset");
                setPresetId(preset.id);
              }}
            >
              <span className="preset-icon" aria-hidden="true">
                {preset.icon}
              </span>
              <span className="preset-label">{preset.label}</span>
              <span className="preset-desc">{preset.description}</span>
              <span className="preset-amount">{preset.suggestedAmount} XLM</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div style={{ marginBottom: "var(--pd-space-4)" }}>
        <button
          type="button"
          className={`btn btn-ghost${mode === "custom" ? " btn-secondary" : ""}`}
          aria-pressed={mode === "custom"}
          onClick={() => setMode(mode === "custom" ? "preset" : "custom")}
        >
          {mode === "custom" ? "Using custom amount" : "Customize amount"}
        </button>
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="recipient-input">
          Recipient Stellar address
        </label>
        <input
          id="recipient-input"
          className="text-input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="GABC..."
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={touched && Boolean(errors.destination)}
          aria-describedby={touched && errors.destination ? "recipient-error" : undefined}
        />
        {touched && errors.destination && (
          <p className="field-error" id="recipient-error" role="alert">
            {errors.destination}
          </p>
        )}
      </div>

      {mode === "custom" && (
        <div className="field-group" style={{ marginTop: "var(--pd-space-4)" }}>
          <label className="field-label" htmlFor="amount-input">
            Amount in XLM (available: {balance ?? "unknown"})
          </label>
          <input
            id="amount-input"
            className="text-input"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.0000001"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && Boolean(errors.amount)}
            aria-describedby={touched && errors.amount ? "amount-error" : undefined}
          />
          {touched && errors.amount && (
            <p className="field-error" id="amount-error" role="alert">
              {errors.amount}
            </p>
          )}
        </div>
      )}

      <button
        type="submit"
        className="btn btn-primary"
        style={{ marginTop: "var(--pd-space-5)", width: "100%" }}
        disabled={disabled}
      >
        Review and send {effectiveAmount || "..."} XLM
      </button>

      <p className="hint-text">
        Payments run on the Stellar Testnet with free faucet funds. Nothing of real
        value moves.
      </p>
    </form>
  );
}

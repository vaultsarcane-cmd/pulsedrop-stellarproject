import type { useContract, RequestRecord } from "../services/contract";
import { useCallback, useEffect, useRef, useState } from "react";

export interface RequestFormValues {
  recipient: string;
  amount: string;
  category: string;
  expiryLedgers: number;
}

export interface RequestFormErrors {
  recipient?: string;
  amount?: string;
  category?: string;
}

export interface RequestCardProps {
  request: RequestRecord;
  onFund?: () => void;
  onCancel?: () => void;
}

export function RequestCard({ request, onFund, onCancel }: RequestCardProps) {
  return (
    <article className="request-card">
      <header className="request-card-head">
        <span className="request-id">#{request.id}</span>
        <span className={`request-status ${request.status.toLowerCase()}`}>
          {request.status}
        </span>
      </header>
      <dl className="request-details">
        <div className="request-detail">
          <dt>Recipient</dt>
          <dd>{request.recipient}</dd>
        </div>
        <div className="request-detail">
          <dt>Amount</dt>
          <dd>{request.amount} XLM</dd>
        </div>
        <div className="request-detail">
          <dt>Category</dt>
          <dd>{request.category}</dd>
        </div>
        <div className="request-detail">
          <dt>Created</dt>
          <dd>Ledger {request.createdLedger}</dd>
        </div>
        <div className="request-detail">
          <dt>Expires</dt>
          <dd>Ledger {request.expiresLedger}</dd>
        </div>
      </dl>
      <div className="request-actions">
        {request.status === "Open" && onCancel && (
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        {request.status === "Open" && onFund && (
          <button className="btn btn-primary" onClick={onFund}>
            Mark funded
          </button>
        )}
      </div>
    </article>
  );
}

const INITIAL_FORM: RequestFormValues = {
  recipient: "",
  amount: "",
  category: "transit",
  expiryLedgers: 6000,
};

const CATEGORIES = ["transit", "mobile-data", "meal", "other"] as const;

function validateForm(values: RequestFormValues): RequestFormErrors {
  const errors: RequestFormErrors = {};
  if (!values.recipient || !/^[A-Za-z0-9]{56}$/.test(values.recipient)) {
    errors.recipient = "Enter a valid Stellar address (56 characters, starts with G).";
  }
  const amountNum = parseFloat(values.amount);
  if (!values.amount || isNaN(amountNum) || amountNum <= 0) {
    errors.amount = "Enter a positive amount in XLM.";
  }
  return errors;
}

export interface UseRequestFormReturn {
  form: RequestFormValues;
  errors: RequestFormErrors;
  submitting: boolean;
  submitError: string | null;
  lastHash: string | null;
  recent: RequestRecord[];
  total: number;
  loadingRecent: boolean;
  syncError: string | null;
  setField: (field: keyof RequestFormValues, value: string | number) => void;
  categoryChange: (cat: string) => void;
  submit: () => Promise<void>;
  reset: () => void;
  resync: () => void;
}

export function useRequestForm(
  contract: ReturnType<typeof useContract> | null,
  creatorPublicKey: string,
  networkOk: boolean | null,
): UseRequestFormReturn {
  const [form, setForm] = useState<RequestFormValues>(INITIAL_FORM);
  const [errors, setErrors] = useState<RequestFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastHash, setLastHash] = useState<string | null>(null);
  const [recent, setRecent] = useState<RequestRecord[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (!contract || !networkOk) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecent([]);
      setTotal(0);
      return;
    }
    const activeContract = contract;
    setLoadingRecent(true);
    setSyncError(null);
    async function load() {
      try {
        const r = await activeContract.recentRequests(10);
        if (!cancelled) setRecent(r);
      } catch (err: unknown) {
        if (!cancelled) setSyncError(err instanceof Error ? err.message : "SYNC_FAILED");
      } finally {
        if (!cancelled) setLoadingRecent(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [contract, networkOk, creatorPublicKey]);

  useEffect(() => {
    let cancelled = false;
    if (!contract || !networkOk) return;
    const activeContract = contract;
    async function load() {
      try {
        const t = await activeContract.totalRequests();
        if (!cancelled) setTotal(t);
      } catch {
        /* ignore */
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [contract, networkOk]);

  const setField = useCallback(
    (field: keyof RequestFormValues, value: string | number) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    },
    [],
  );

  const categoryChange = useCallback((cat: string) => {
    setForm((prev) => ({ ...prev, category: cat }));
    setErrors((prev) => ({ ...prev, category: undefined }));
  }, []);

  const submit = useCallback(async () => {
    if (!contract || !networkOk || !creatorPublicKey) return;
    const validation = validateForm(form);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setLastHash(null);

    const result = await contract.createRequest(
      creatorPublicKey,
      form.recipient,
      form.amount,
      form.category,
      form.expiryLedgers,
    );

    inFlightRef.current = false;
    setSubmitting(false);

    if (result.ok && result.hash) {
      setLastHash(result.hash);
      const r = await contract.recentRequests(10);
      setRecent(r);
    } else {
      setSubmitError(result.error ?? "REQUEST_CREATION_FAILED");
    }
  }, [contract, networkOk, creatorPublicKey, form]);

  const reset = useCallback(() => {
    setForm(INITIAL_FORM);
    setErrors({});
    setSubmitError(null);
    setLastHash(null);
    inFlightRef.current = false;
    setSubmitting(false);
  }, []);

  const resync = useCallback(() => {
    if (!contract || !networkOk) return;
    const activeContract = contract;
    setLoadingRecent(true);
    setSyncError(null);
    async function reload() {
      try {
        const r = await activeContract.recentRequests(10);
        setRecent(r);
      } catch (err: unknown) {
        setSyncError(err instanceof Error ? err.message : "SYNC_FAILED");
      } finally {
        setLoadingRecent(false);
      }
    }
    void reload();
  }, [contract, networkOk]);

  return {
    form,
    errors,
    submitting,
    submitError,
    lastHash,
    recent,
    total,
    loadingRecent,
    syncError,
    setField,
    categoryChange,
    submit,
    reset,
    resync,
  };
}

export function RequestForm({
  creatorPublicKey,
  networkOk,
  contract,
  onFundRequest,
  onCancelRequest,
}: {
  creatorPublicKey: string;
  networkOk: boolean | null;
  contract: ReturnType<typeof useContract> | null;
  onFundRequest: (id: number) => void;
  onCancelRequest: (id: number) => void;
}) {
  const form = useRequestForm(contract, creatorPublicKey, networkOk);

  return (
    <section className="request-section" aria-labelledby="request-section-title">
      <h2 id="request-section-title" className="request-section-title">
        Assistance Request
      </h2>

      {form.syncError && (
        <div className="sync-error-banner" role="alert">
          Activity sync failed: {form.syncError}.{" "}
          <button className="btn btn-ghost btn-sm" onClick={() => form.reset()}>
            Retry
          </button>
        </div>
      )}

      <form className="request-form" onSubmit={(e) => { e.preventDefault(); void form.submit(); }}>
        <div className="form-group">
          <label className="form-label" htmlFor="recipient-input">
            Recipient
          </label>
          <input
            id="recipient-input"
            className={`input ${form.errors.recipient ? "input-error" : ""}`}
            type="text"
            placeholder="G… (56 characters)"
            value={form.form.recipient}
            onChange={(e) => form.setField("recipient", e.target.value)}
          />
          {form.errors.recipient && (
            <span className="field-error">{form.errors.recipient}</span>
          )}
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="amount-input">
            Amount (XLM)
          </label>
          <input
            id="amount-input"
            className={`input ${form.errors.amount ? "input-error" : ""}`}
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={form.form.amount}
            onChange={(e) => form.setField("amount", e.target.value)}
          />
          {form.errors.amount && (
            <span className="field-error">{form.errors.amount}</span>
          )}
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="category-select">
            Category
          </label>
          <select
            id="category-select"
            className="input select"
            value={form.form.category}
            onChange={(e) => form.categoryChange(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c === "mobile-data" ? "Mobile data" : c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="expiry-input">
            Expiry (ledgers)
          </label>
          <input
            id="expiry-input"
            className="input"
            type="number"
            min="10"
            max="34560"
            step="100"
            value={form.form.expiryLedgers}
            onChange={(e) => form.setField("expiryLedgers", parseInt(e.target.value, 10) || 6000)}
          />
          <span className="field-hint">
            ~{Math.round((form.form.expiryLedgers * 5) / 60 / 60 / 24)} days at 5s ledger close
          </span>
        </div>

        <div className="form-actions">
          <button
            className="btn btn-primary"
            type="submit"
            disabled={form.submitting || !networkOk || !creatorPublicKey}
          >
            {form.submitting ? "Submitting…" : "Create request"}
          </button>
          {form.lastHash && (
            <a
              className="btn btn-ghost"
              href={`https://stellar.expert/explorer/testnet/tx/${form.lastHash}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on explorer
            </a>
          )}
        </div>
        {form.submitError && (
          <p className="form-submission-error" role="alert">
            {form.submitError}
          </p>
        )}
      </form>

      <div className="request-list-wrap">
        <h3 className="request-list-title">Recent requests</h3>
        {form.loadingRecent && (
          <p className="request-list-loading">Loading activity…</p>
        )}
        {form.recent.length > 0 && (
          <ul className="request-list">
            {form.recent.map((req) => (
              <li key={req.id}>
                <RequestCard
                  request={req}
                  onFund={() => onFundRequest(req.id)}
                  onCancel={() => onCancelRequest(req.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

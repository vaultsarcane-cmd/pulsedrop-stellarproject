import { useEffect, useRef, useState } from "react";
import { useContract } from "../services/contract";
import type { RequestRecord, SorobanEnv } from "../services/contract";

export interface SyncPaneProps {
  contractEnv: SorobanEnv;
  creatorPublicKey: string;
  networkOk: boolean | null;
  onResync: () => void;
}

export function SyncPane({
  contractEnv,
  creatorPublicKey,
  networkOk,
  onResync,
}: SyncPaneProps) {
  const contract = useContract(contractEnv);
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncLedger, setLastSyncLedger] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    if (!contract || !networkOk || !creatorPublicKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRequests([]);
      setTotal(0);
      return;
    }

    const activeContract = contract;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const [reqs, tot] = await Promise.all([
          activeContract.recentRequests(20),
          activeContract.totalRequests(),
        ]);
        if (mountedRef.current) {
          setRequests(reqs);
          setTotal(tot);
          const eventPage = await activeContract.eventsSince();
          setLastSyncLedger(eventPage.latestLedger);
        }
      } catch (err: unknown) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : "SYNC_FAILED");
        }
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }

    void load();
    return () => { mountedRef.current = false; };
  }, [contract, networkOk, creatorPublicKey]);

  useEffect(() => {
    mountedRef.current = true;
    if (!contract || !networkOk || !creatorPublicKey) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }

    const activeContract = contract;
    const intervalMs = 20000;
    timerRef.current = setInterval(() => {
      if (!mountedRef.current || !contract) return;
      async function poll() {
        try {
          const eventPage = await activeContract.eventsSince(lastSyncLedger ?? undefined);
          if (mountedRef.current) setLastSyncLedger(eventPage.latestLedger);
          if (eventPage.events.length > 0) {
            const [reqs, tot] = await Promise.all([activeContract.recentRequests(20), activeContract.totalRequests()]);
            if (mountedRef.current) { setRequests(reqs); setTotal(tot); }
          }
        } catch {
          /* silent poll failure */
        }
      }
      void poll();
    }, intervalMs);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      mountedRef.current = false;
    };
  }, [contract, networkOk, creatorPublicKey, lastSyncLedger]);

  function handleResync() {
    onResync();
  }

  if (!contract || !networkOk || !creatorPublicKey) {
    return (
      <div className="sync-pane sync-pane-empty">
        <p className="sync-pane-empty-text">
          {!networkOk
            ? "Connect to Stellar Testnet to see synchronized activity."
            : "Connect a wallet to see synchronized activity."}
        </p>
      </div>
    );
  }

  return (
    <section className="sync-pane" aria-labelledby="sync-pane-title">
      <h3 id="sync-pane-title" className="sync-pane-title">
        Synchronized Activity
      </h3>

      {error && (
        <div className="sync-pane-error" role="alert">
          Sync error: {error}.{" "}
          <button className="btn btn-ghost btn-sm" onClick={handleResync}>
            Resync
          </button>
        </div>
      )}

      {loading && (
        <div className="sync-pane-loading">
          <span className="sync-spinner" aria-hidden="true" />
          <span>Syncing…</span>
        </div>
      )}

      {!loading && !error && requests.length === 0 && (
        <p className="sync-pane-empty-text">No requests yet.</p>
      )}

      {!loading && !error && requests.length > 0 && (
        <ul className="sync-pane-list" aria-label="Recent requests">
          {requests.slice(0, 10).map((req) => (
            <li key={req.id} className="sync-pane-item">
              <span>#{req.id}</span>
              <span className="sync-pane-amount">{req.amount} XLM</span>
              <span className={`sync-pane-status ${req.status.toLowerCase()}`}>
                {req.status}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="sync-pane-meta">
        <span>Last synced: {lastSyncLedger ? `Ledger ${lastSyncLedger}` : "—"}</span>
        <span>Total: {total}</span>
        <button className="btn btn-ghost btn-sm" onClick={handleResync}>
          Manual resync
        </button>
      </div>
    </section>
  );
}

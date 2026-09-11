import { useMemo } from "react";
import {
  Account, Address, Contract, Networks, TransactionBuilder, nativeToScVal,
  scValToNative, rpc,
} from "@stellar/stellar-sdk";
import type { xdr } from "@stellar/stellar-sdk";

export interface SorobanEnv { rpcUrl: string; contractId: string }
const FALLBACK_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYBCU";
const DEFAULT_ENV: SorobanEnv = {
  rpcUrl: import.meta.env.VITE_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org",
  contractId: import.meta.env.VITE_CONTRACT_ID ?? FALLBACK_CONTRACT_ID,
};
export const isContractConfigured = (env: SorobanEnv) => env.contractId !== FALLBACK_CONTRACT_ID;

export interface RequestRecord {
  id: number; creator: string; recipient: string; amount: string; category: string;
  createdLedger: number; expiresLedger: number; status: string;
}
export interface ContractEventUpdate { ledger: number; id: string }
export interface ContractMethods {
  createRequest: (creator: string, recipient: string, amount: string, category: string, expiryLedgers: number) => Promise<{ ok: boolean; hash?: string; error?: string }>;
  fundRequest: (requester: string, requestId: number) => Promise<{ ok: boolean; hash?: string; error?: string }>;
  cancelRequest: (requester: string, requestId: number) => Promise<{ ok: boolean; hash?: string; error?: string }>;
  getRequest: (requestId: number) => Promise<RequestRecord | null>;
  recentRequests: (limit: number) => Promise<RequestRecord[]>;
  totalRequests: () => Promise<number>;
  eventsSince: (startLedger?: number) => Promise<{ latestLedger: number; events: ContractEventUpdate[] }>;
}
export interface UseContractOptions {
  publicKey?: string;
  signTransaction?: (tx: string) => Promise<{ signedTxXdr: string; signerAddress?: string }>;
}

const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const serverFor = (env: SorobanEnv) => new rpc.Server(env.rpcUrl, { allowHttp: env.rpcUrl.startsWith("http:") });
const address = (value: string) => new Address(value).toScVal();
const u64 = (value: number) => nativeToScVal(BigInt(value), { type: "u64" });
const u32 = (value: number) => nativeToScVal(value, { type: "u32" });

function stroops(xlm: string) {
  const [whole = "0", fraction = ""] = xlm.trim().split(".");
  return BigInt(whole) * 10_000_000n + BigInt((fraction + "0000000").slice(0, 7));
}
function argsFor(method: string, values: unknown[]): xdr.ScVal[] {
  if (method === "create_request") return [address(String(values[0])), address(String(values[1])), nativeToScVal(stroops(String(values[2])), { type: "i128" }), nativeToScVal(String(values[3]), { type: "string" }), u32(Number(values[4]))];
  if (method === "fund_request" || method === "cancel_request") return [address(String(values[0])), u64(Number(values[1]))];
  if (method === "get_request") return [u64(Number(values[0]))];
  if (method === "recent_requests") return [u32(Number(values[0]))];
  return [];
}
function transaction(source: Account, env: SorobanEnv, method: string, args: xdr.ScVal[]) {
  return new TransactionBuilder(source, { fee: "100000", networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(env.contractId).call(method, ...args)).setTimeout(60).build();
}
async function read(env: SorobanEnv, method: string, values: unknown[]) {
  if (!isContractConfigured(env)) throw new Error("Contract is not configured. Set VITE_CONTRACT_ID after Testnet deployment.");
  const response = await serverFor(env).simulateTransaction(transaction(new Account(NULL_ACCOUNT, "0"), env, method, argsFor(method, values)));
  if (!rpc.Api.isSimulationSuccess(response) || !response.result) throw new Error("Contract simulation failed.");
  return scValToNative(response.result.retval);
}
async function write(env: SorobanEnv, method: string, values: unknown[], publicKey: string, sign: NonNullable<UseContractOptions["signTransaction"]>) {
  if (!isContractConfigured(env)) return { ok: false, error: "Contract is not configured. Deploy it and set VITE_CONTRACT_ID." };
  try {
    const server = serverFor(env);
    const account = await server.getAccount(publicKey);
    const raw = transaction(account, env, method, argsFor(method, values));
    const simulation = await server.simulateTransaction(raw);
    if (!rpc.Api.isSimulationSuccess(simulation)) return { ok: false, error: "Contract simulation failed." };
    const prepared = rpc.assembleTransaction(raw, simulation).build();
    const { signedTxXdr } = await sign(prepared.toXDR());
    const signed = TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET);
    const sent = await server.sendTransaction(signed);
    if (sent.status === "ERROR") return { ok: false, error: "The network rejected the contract transaction." };
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const result = await server.getTransaction(sent.hash);
      if (result.status === "SUCCESS") return { ok: true, hash: sent.hash };
      if (result.status === "FAILED") return { ok: false, error: "Contract transaction failed on Testnet." };
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return { ok: false, error: "Transaction is still pending. Check the hash in Stellar Expert." };
  } catch (cause) { return { ok: false, error: cause instanceof Error ? cause.message : "Contract call failed." }; }
}
function record(raw: Record<string, unknown>): RequestRecord {
  const statusValue = raw.status;
  const status = typeof statusValue === "string" ? statusValue : Object.keys((statusValue ?? {}) as object)[0] ?? "Unknown";
  return {
    id: Number(raw.id ?? 0), creator: String(raw.creator ?? ""), recipient: String(raw.recipient ?? ""),
    amount: (BigInt(String(raw.amount ?? 0)) / 10_000_000n).toString(), category: String(raw.category ?? ""),
    createdLedger: Number(raw.created_ledger ?? 0), expiresLedger: Number(raw.expires_ledger ?? 0), status,
  };
}

export function useContract(env: SorobanEnv = DEFAULT_ENV, options?: UseContractOptions): ContractMethods | null {
  const publicKey = options?.publicKey;
  const sign = options?.signTransaction;
  return useMemo(() => {
    if (!publicKey || !sign) return null;
    return {
      createRequest: (creator, recipient, amount, category, expiry) => write(env, "create_request", [creator, recipient, amount, category, expiry], publicKey, sign),
      fundRequest: (requester, id) => write(env, "fund_request", [requester, id], publicKey, sign),
      cancelRequest: (requester, id) => write(env, "cancel_request", [requester, id], publicKey, sign),
      getRequest: async (id) => { try { return record(await read(env, "get_request", [id])); } catch { return null; } },
      recentRequests: async (limit) => ((await read(env, "recent_requests", [limit])) as Record<string, unknown>[]).map(record),
      totalRequests: async () => Number(await read(env, "total_requests", [])),
      eventsSince: async (startLedger) => {
        const server = serverFor(env);
        const latest = await server.getLatestLedger();
        const from = startLedger ?? Math.max(1, latest.sequence - 1);
        const response = await server.getEvents({ startLedger: from, filters: [{ type: "contract", contractIds: [env.contractId] }], limit: 100 });
        return { latestLedger: latest.sequence, events: response.events.map((event) => ({ ledger: event.ledger, id: event.id })) };
      },
    };
  }, [env, publicKey, sign]);
}

export const contractExplorerUrl = (contractId: string) => `https://stellar.expert/explorer/testnet/contract/${contractId}`;
export const transactionExplorerUrl = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`;

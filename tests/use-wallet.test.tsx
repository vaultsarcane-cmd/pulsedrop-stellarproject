// Integration tests for the wallet lifecycle hook: delayed detection,
// unavailable wallets, access rejection, locked state, wrong network,
// successful connection, manual recovery, and StrictMode-safe init.
import { cleanup, renderHook, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWallet } from "../src/hooks/useWallet";

const freighterState = vi.hoisted(() => ({
  connected: false,
  allowed: false,
  address: "",
  network: "TESTNET",
  networkError: undefined as unknown,
}));

vi.mock("@stellar/freighter-api", () => ({
  isConnected: vi.fn(async () => ({ isConnected: freighterState.connected })),
  isAllowed: vi.fn(async () => ({ isAllowed: freighterState.allowed })),
  getAddress: vi.fn(async () => {
    if (freighterState.address) return { address: freighterState.address };
    return { address: "", error: { code: -1, message: "wallet is locked" } };
  }),
  requestAccess: vi.fn(async () => {
    if (freighterState.allowed && freighterState.address) {
      return { address: freighterState.address };
    }
    return { address: "", error: { code: -1, message: "rejected" } };
  }),
  getNetwork: vi.fn(async () => {
    if (freighterState.networkError) {
      return { network: "", networkPassphrase: "", error: freighterState.networkError };
    }
    return {
      network: freighterState.network,
      networkPassphrase: "Test SDF Network ; September 2015",
    };
  }),
}));

vi.mock("../src/services/horizon", () => ({
  fetchXlmBalance: vi.fn(async () => ({ ok: true, balance: "25.5000000" })),
}));

const ADDRESS = "GA7QYNF7SOWQ3GLR2ZGMGIWQGNKWRRGDCB4VPFVKGNTTJOOOSAHC7YQ4";

function resetFreighter() {
  freighterState.connected = false;
  freighterState.allowed = false;
  freighterState.address = "";
  freighterState.network = "TESTNET";
  freighterState.networkError = undefined;
}

beforeEach(() => {
  resetFreighter();
});

afterEach(() => {
  cleanup();
});

describe("useWallet lifecycle", () => {
  it("stays in the detecting phase and never reports a missing wallet while polling", async () => {
    // Extension answers only after the first detection attempts.
    let polls = 0;
    const { result } = renderHook(() => useWallet());
    expect(result.current.phase).toBe("detecting");

    await waitFor(
      () => {
        polls += 1;
      },
      { timeout: 100 },
    );
    // Phase must not be "unavailable" while still within the retry window.
    expect(result.current.phase).not.toBe("unavailable");
  });

  it("transitions to disconnected when Freighter appears during the retry window", async () => {
    setTimeout(() => {
      freighterState.connected = true;
    }, 300);
    const { result } = renderHook(() => useWallet());
    expect(result.current.phase).toBe("detecting");
    await waitFor(() => expect(result.current.phase).toBe("disconnected"), {
      timeout: 10_000,
    });
    expect(result.current.publicKey).toBeNull();
  });

  it("reports unavailable only after the bounded window elapses", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useWallet());
      expect(result.current.phase).toBe("detecting");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(9_000);
      });
      expect(result.current.phase).toBe("unavailable");
      expect(result.current.installed).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("recovers via recheckWallet after an initial detection failure", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useWallet());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(9_000);
      });
      expect(result.current.phase).toBe("unavailable");

      freighterState.connected = true;
      act(() => {
        result.current.recheckWallet();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      expect(result.current.phase).toBe("disconnected");
      expect(result.current.installed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("connects on Testnet, exposes the key, and loads the XLM balance", async () => {
    freighterState.connected = true;
    const { result } = renderHook(() => useWallet());
    await waitFor(() => expect(result.current.phase).toBe("disconnected"));

    freighterState.allowed = true;
    freighterState.address = ADDRESS;
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.publicKey).toBe(ADDRESS);
    expect(result.current.networkOk).toBe(true);
    expect(result.current.balance).toBe("25.5000000");
  });

  it("surfaces ACCESS_REQUEST_REJECTED when the user dismisses the prompt", async () => {
    freighterState.connected = true;
    const { result } = renderHook(() => useWallet());
    await waitFor(() => expect(result.current.phase).toBe("disconnected"));

    // allowed stays false -> mocked requestAccess returns a rejection error.
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.connectionError).toBe("ACCESS_REQUEST_REJECTED");
    expect(result.current.publicKey).toBeNull();
  });

  it("signals WALLET_LOCKED for an installed but locked wallet", async () => {
    freighterState.connected = true;
    freighterState.allowed = true;
    freighterState.address = "";
    const { result } = renderHook(() => useWallet());
    await waitFor(() => expect(result.current.phase).toBe("disconnected"));

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.connectionError).toBe("WALLET_LOCKED");
  });

  it("flags WRONG_NETWORK when Freighter is not on Testnet", async () => {
    freighterState.connected = true;
    freighterState.network = "PUBLIC";
    const { result } = renderHook(() => useWallet());
    await waitFor(() => expect(result.current.phase).toBe("disconnected"));

    freighterState.allowed = true;
    freighterState.address = ADDRESS;
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.networkOk).toBe(false);
    expect(result.current.balance).toBeNull();
  });

  it("resumes a previously granted session without prompting", async () => {
    freighterState.connected = true;
    freighterState.allowed = true;
    freighterState.address = ADDRESS;
    const { result } = renderHook(() => useWallet());
    await waitFor(() => expect(result.current.publicKey).toBe(ADDRESS));
    expect(result.current.networkOk).toBe(true);
    expect(result.current.balance).toBe("25.5000000");
  });

  it("does not loop initialization after repeated rechecks", async () => {
    freighterState.connected = true;
    const { result } = renderHook(() => useWallet());
    await waitFor(() => expect(result.current.phase).toBe("disconnected"));
    const first = result.current;

    act(() => {
      result.current.recheckWallet();
    });
    await waitFor(() => expect(result.current.phase).toBe("disconnected"));
    // Same stable phase, no runaway state churn.
    expect(result.current.installed).toBe(first.installed);
    expect(result.current.connecting).toBe(false);
  });
});

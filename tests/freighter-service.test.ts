// Unit tests for the Freighter service layer: detection polling, access
// mapping, network guard, and error-code classification.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const freighterState = vi.hoisted(() => ({
  // Detection
  pendingFalseCalls: 0,
  connected: false,
  bridgeDown: false,
  // Session
  allowed: false,
  address: "",
  // Access request
  accessError: undefined as unknown,
  accessAddress: "",
  accessThrows: false,
  // Network
  network: "TESTNET",
  networkError: undefined as unknown,
}));

vi.mock("@stellar/freighter-api", () => ({
  isConnected: vi.fn(async () => {
    if (freighterState.pendingFalseCalls > 0) {
      freighterState.pendingFalseCalls -= 1;
      return { isConnected: false };
    }
    if (freighterState.bridgeDown) {
      throw new Error("extension bridge down");
    }
    return { isConnected: freighterState.connected };
  }),
  isAllowed: vi.fn(async () => {
    if (freighterState.bridgeDown) {
      return { isAllowed: false, error: { code: -1, message: "internal error" } };
    }
    return { isAllowed: freighterState.allowed };
  }),
  getAddress: vi.fn(async () => {
    if (freighterState.address) {
      return { address: freighterState.address };
    }
    return { address: "", error: { code: -1, message: "wallet is locked" } };
  }),
  requestAccess: vi.fn(async () => {
    if (freighterState.accessThrows) {
      throw new Error("messaging failure");
    }
    if (freighterState.accessError) {
      return { address: "", error: freighterState.accessError };
    }
    return { address: freighterState.accessAddress };
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

import {
  checkNetwork,
  connectWallet,
  EXPECTED_NETWORK,
  getActivePublicKey,
  waitForFreighter,
} from "../src/services/freighter";

describe("waitForFreighter", () => {
  beforeEach(() => {
    freighterState.bridgeDown = false;
    freighterState.connected = false;
    freighterState.pendingFalseCalls = 0;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports detected immediately when the extension answers", async () => {
    freighterState.connected = true;
    const promise = waitForFreighter(2000, 100);
    const result = await vi.waitFor(async () => {
      const r = await promise;
      return r;
    });
    expect(result.status).toBe("detected");
  });

  it("keeps polling through delayed extension injection and detects late arrival", async () => {
    freighterState.connected = false;
    freighterState.pendingFalseCalls = 3;

    let result: { status: string } | undefined;
    const promise = waitForFreighter(10_000, 250).then((r) => {
      result = r;
      return r;
    });
    await vi.advanceTimersByTimeAsync(400);
    freighterState.connected = true;
    await vi.advanceTimersByTimeAsync(600);
    await promise;
    expect(result?.status).toBe("detected");
  });

  it("returns unavailable after the bounded timeout without looping forever", async () => {
    freighterState.connected = false;
    let settled = false;
    const promise = waitForFreighter(1000, 200).then((r) => {
      settled = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(1400);
    const result = await promise;
    expect(settled).toBe(true);
    expect(result.status).toBe("unavailable");
  });

  it("treats transient bridge failures as not-ready-yet, not as missing hardware", async () => {
    freighterState.bridgeDown = true;
    let settled = false;
    const promise = waitForFreighter(600, 150).then((r) => {
      settled = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect(settled).toBe(true);
    expect(result.status).toBe("unavailable");
  });
});

describe("connectWallet", () => {
  it("returns the public key when access is granted", async () => {
    freighterState.accessError = undefined;
    freighterState.accessThrows = false;
    freighterState.accessAddress = "GA7QYNF7SOWQ3GLR2ZGMGIWQGNKWRRGDCB4VPFVKGNTTJOOOSAHC7YQ4";
    const result = await connectWallet();
    expect(result.ok).toBe(true);
    expect(result.publicKey).toBe(freighterState.accessAddress);
  });

  it("classifies an explicit rejection error as ACCESS_REQUEST_REJECTED", async () => {
    freighterState.accessError = { code: -1, message: "The user rejected access" };
    const result = await connectWallet();
    expect(result.ok).toBe(false);
    expect(result.error).toBe("ACCESS_REQUEST_REJECTED");
  });

  it("classifies an empty address as a locked wallet", async () => {
    freighterState.accessError = undefined;
    freighterState.accessAddress = "";
    const result = await connectWallet();
    expect(result.ok).toBe(false);
    expect(result.error).toBe("WALLET_LOCKED");
  });

  it("classifies a messaging failure as ACCESS_REQUEST_FAILED", async () => {
    freighterState.accessThrows = true;
    const result = await connectWallet();
    expect(result.ok).toBe(false);
    expect(result.error).toBe("ACCESS_REQUEST_FAILED");
  });
});

describe("checkNetwork", () => {
  it("passes when Freighter reports Testnet", async () => {
    freighterState.network = EXPECTED_NETWORK;
    freighterState.networkError = undefined;
    const result = await checkNetwork();
    expect(result.ok).toBe(true);
    expect(result.network).toBe("TESTNET");
  });

  it("fails with WRONG_NETWORK on any other network", async () => {
    freighterState.network = "PUBLIC";
    const result = await checkNetwork();
    expect(result.ok).toBe(false);
    expect(result.error).toBe("WRONG_NETWORK");
    expect(result.network).toBe("PUBLIC");
  });

  it("fails with NETWORK_CHECK_FAILED when the network query errors", async () => {
    freighterState.networkError = { code: -1, message: "internal error" };
    const result = await checkNetwork();
    expect(result.ok).toBe(false);
    expect(result.error).toBe("NETWORK_CHECK_FAILED");
  });
});

describe("getActivePublicKey", () => {
  beforeEach(() => {
    freighterState.allowed = false;
    freighterState.address = "";
    freighterState.bridgeDown = false;
  });
  afterEach(() => {
    freighterState.bridgeDown = false;
  });

  it("resumes an existing granted session with its address", async () => {
    freighterState.allowed = true;
    freighterState.address = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
    const result = await getActivePublicKey();
    expect(result).toEqual({ address: freighterState.address });
  });

  it("returns null when access was never granted", async () => {
    freighterState.allowed = false;
    const result = await getActivePublicKey();
    expect(result).toBeNull();
  });

  it("signals WALLET_LOCKED when the grant exists but the wallet cannot answer", async () => {
    freighterState.allowed = true;
    freighterState.address = "";
    const result = await getActivePublicKey();
    expect(result).toEqual({ error: "WALLET_LOCKED" });
  });

  it("signals WALLET_DETECTING on transient bridge errors", async () => {
    freighterState.bridgeDown = true;
    const result = await getActivePublicKey();
    expect(result).toEqual({ error: "WALLET_DETECTING" });
  });
});

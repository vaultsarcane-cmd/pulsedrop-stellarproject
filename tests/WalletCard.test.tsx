import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WalletCard } from "../src/components/WalletCard";
import type { useWalletSelector } from "../src/services/walletSelector";

vi.mock("@creit.tech/stellar-wallets-kit/sdk", () => ({
  StellarWalletsKit: { init: vi.fn(), setNetwork: vi.fn(), disconnect: vi.fn() },
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/utils", () => ({ defaultModules: () => [] }));

function wallet(overrides: Partial<ReturnType<typeof useWalletSelector>> = {}) {
  return {
    wallets: [
      { id: "freighter", label: "Freighter", installed: true },
      { id: "albedo", label: "Albedo", installed: true },
    ],
    selectedId: null, connected: null, connecting: false, error: null,
    walletUnavailable: false, accessRejected: false, signatureRejected: false,
    wrongNetwork: false, networkChecking: false, balance: null,
    balanceLoading: false, balanceError: null, selectWallet: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined), disconnect: vi.fn(),
    checkNetwork: vi.fn().mockResolvedValue(true), refreshBalance: vi.fn().mockResolvedValue(undefined),
    signTransaction: vi.fn(), ...overrides,
  } as ReturnType<typeof useWalletSelector>;
}

function renderCard(state: ReturnType<typeof useWalletSelector>) {
  render(<WalletCard wallet={state} onRefreshBalance={state.refreshBalance}
    onCheckNetwork={state.checkNetwork} onSelectContractAction={vi.fn()} />);
}

describe("WalletCard", () => {
  it("shows multiple wallet options", () => {
    renderCard(wallet());
    expect(screen.getByText("Freighter")).toBeTruthy();
    expect(screen.getByText("Albedo")).toBeTruthy();
  });

  it("selects and connects a wallet", () => {
    const state = wallet({ selectedId: "freighter" });
    renderCard(state);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(state.connect).toHaveBeenCalledOnce();
  });

  it("renders the connected account and disconnects", () => {
    const state = wallet({
      connected: { walletId: "freighter", label: "Freighter", publicKey: `G${"A".repeat(55)}` },
      balance: "25.0000000",
    });
    renderCard(state);
    expect(screen.getByText("25.0000000 XLM")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(state.disconnect).toHaveBeenCalledOnce();
  });

  it("shows rejected access distinctly", () => {
    renderCard(wallet({ accessRejected: true, error: "Access was rejected" }));
    expect(screen.getByText(/Access was rejected/i)).toBeTruthy();
  });
});

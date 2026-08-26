# PulseDrop

PulseDrop is a rapid Stellar Testnet assistance-payment interface. Instead of a
generic payment form, users pick an urgent preset — **Transit**, **Mobile
Data**, or **Meal** — or enter a custom amount, and send XLM directly to the
recipient's wallet with a clearly explained pending/success/failure receipt.

> ⚠️ **Testnet only.** PulseDrop runs exclusively against the Stellar Testnet.
> Balances come from the free friendbot faucet and have no monetary value.
> Never enter a real secret key anywhere in this app.

## Features

- Freighter wallet detection, connection, and disconnection
- Explicit Testnet network guard that locks payments until Freighter is on Testnet
- Live XLM balance display with refresh action
- Three urgent assistance presets plus a custom amount mode
- Client-side validation of recipient address and amount (including fee headroom)
- Full payment lifecycle: build → sign in Freighter → submit to Horizon → confirm
- Pending, success, and failure receipt states with transaction hash and a
  [Stellar Expert](https://stellar.expert) Testnet explorer link
- Duplicate-submission lock while a transaction is pending
- Distinct error messages for: missing wallet, dismissed access request,
  dismissed signing, wrong network, invalid address, insufficient balance,
  malformed transactions, and Horizon outages

## Prerequisites

- **Node.js 18+** (tested on Node 20 and 24)
- npm 9+
- The [Freighter browser extension](https://www.freighter.app/) installed
- A funded Testnet account inside Freighter. If your account has no XLM,
  request funds from the [friendbot faucet](https://friendbot.stellar.org/)
  by entering your public address in its URL:
  `https://friendbot.stellar.org/?addr=<YOUR_PUBLIC_KEY>`
- Set Freighter's network to **Test Network** (extension settings)

## Local Setup

```bash
# 1. Clone the repository
git clone https://github.com/vaultsarcane-cmd/pulsedrop-stellarproject.git
cd pulsedrop-stellarproject

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

Open `http://localhost:5173` in the browser where Freighter is installed.

## Environment Variables

No environment variables are required. The Horizon Testnet endpoint
(`https://horizon-testnet.stellar.org`) is hard-coded by design so the app can
never accidentally target Mainnet.

## Available Scripts

| Command           | Description                          |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Start the Vite dev server            |
| `npm run build`   | Typecheck + production build         |
| `npm run preview` | Preview the production build locally |
| `npm test`        | Run unit tests (Vitest)              |
| `npm run lint`    | Lint with ESLint                     |
| `npm run typecheck` | TypeScript project check           |

## Architecture

```
src/
├── components/       # WalletCard, PaymentForm, ReceiptCard UI sections
├── hooks/
│   ├── useWallet.ts             # Freighter lifecycle + balance state
│   ├── usePayment.ts            # Build/sign/submit lifecycle + receipt state
│   └── useCopyToClipboard.ts    # Copy feedback for the public key
├── services/
│   ├── freighter.ts  # Typed wrapper over the injected Freighter API
│   └── horizon.ts    # Balance lookup + payment submission via stellar-sdk
├── lib/
│   ├── presets.ts    # Assistance presets + input validation rules
│   └── format.ts     # Key abbreviation, amount formatting, validation
└── styles/           # Dark design tokens, shell, component styles
```

The app never touches secret keys: transactions are built as unsigned XDR,
handed to Freighter for signing, and only the signed envelope is submitted.

## Screenshots

![Wallet connected with balance](docs/screenshots/wallet-connected.png)
_Freighter connected on Stellar Testnet with the public key and XLM balance visible._

![Payment form with preset selected](docs/screenshots/payment-preset.png)
_Transit assistance preset selected with a validated Testnet recipient._

![Freighter transaction confirmation](docs/screenshots/payment-submitting.png)
_Freighter confirmation and PulseDrop's submitting state during the live payment._

![Successful payment receipt](docs/screenshots/receipt-success.png)
_Successful Testnet receipt with the transaction hash and explorer action._

![Successful transaction on Stellar Expert](docs/screenshots/stellar-payment-hash.png)
_The same payment independently verified as successful on Stellar Expert._

## Verified Example Transaction

A real Testnet payment made during manual verification:

- Transaction hash: `6c0b4e0ae29acdd89a3a701d170bab437827f2ee945f360594be32969c145bba`
- Explorer link: [View the successful Testnet payment on Stellar Expert](https://stellar.expert/explorer/testnet/tx/6c0b4e0ae29acdd89a3a701d170bab437827f2ee945f360594be32969c145bba)

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "No Stellar wallet detected" | Install Freighter from freighter.app and reload the page. |
| Payments locked with a wrong-network warning | Switch Freighter to Test Network, then press Retry Testnet check. |
| "Balance unavailable" | Fund the account via friendbot, then press Refresh balance. |
| Signing dismissed | Nothing was sent; press Review and send again when ready. |

## License

MIT

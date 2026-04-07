# bnbzkidjssdk-demo

Minimal **Vite + React** demo for
[`@primuslabs/bnb-zkid-sdk`](https://www.npmjs.com/package/@primuslabs/bnb-zkid-sdk),
using the Brevis Gateway + Primus SDK flow.

## Quick Start

Follow the steps in order to run the demo successfully.

### 1) Install Primus browser extension first

The full `prove` flow depends on the Primus extension.

Download extension package from:
<https://github.com/primus-labs/BNB-ZKID-SDK/tree/main/extension>

After downloading, install/load the extension in your browser, then make sure the
extension is enabled before opening this demo page.

### 2) Install dependencies

```bash
npm install
```

### 3) Start the demo

```bash
npm run dev
```

Open the printed URL (default: `http://127.0.0.1:5173`).

## First-time usage flow (recommended)

1. Open the demo page after `npm run dev`.
2. Connect MetaMask when prompted.
3. Keep or edit the auto-filled user address.
4. Select provider and trigger the prove flow.

If the extension is not installed/enabled, the prove flow cannot complete.

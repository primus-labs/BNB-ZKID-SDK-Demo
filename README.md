# bnbzkidjssdk-demo

Minimal **Vite + React** demo for
[`@primuslabs/bnb-zkid-sdk`](https://www.npmjs.com/package/@primuslabs/bnb-zkid-sdk).

## Quick Start

Follow the steps below to run the demo locally.

### 1) Install dependencies

```bash
npm install
```

### 2) Start the demo

```bash
npm run dev
```

Open the printed URL (default: `http://127.0.0.1:5173`).

## First-time usage flow (recommended)

1. Open the demo page after `npm run dev`.
2. Connect MetaMask when prompted.
3. Keep or edit the auto-filled user address.
4. Select a provider and start the proving flow.
5. The proving flow requires the Primus extension. Before starting a verification process, the SDK checks whether the extension is installed and enabled. If not, follow the in-app install prompt.

## Primus Extension

The Primus extension is required for the proving flow.

During the `prove` flow, the demo calls `client.init()` before continuing. If `init()` throws `BnbZkIdProveError` with code `00000`, the demo treats it as "Primus Extension not detected" and shows the in-app install prompt.

That install prompt directs the user to the Chrome Web Store:

<https://chromewebstore.google.com/detail/primus/oeiomhmbaapihbilkfkhmlajkeegnjhe>

If the extension is already installed and enabled, the proof flow continues normally.

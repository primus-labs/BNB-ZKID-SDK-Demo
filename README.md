# bnbzkidjssdk-demo

Minimal **Vite + React** demo for [`@superorange/bnbzkid-js-sdk`](https://www.npmjs.com/package/@superorange/bnbzkid-js-sdk) using the Brevis Gateway + Primus SDK flow.

## Prerequisites

- Node 18+
- npm (or pnpm/yarn)

Completing the full `prove` flow requires a **Primus browser extension** environment.

The page calls `client.init({ appId })` once on load and uses the returned `providers`
to render the selector. It does not call `GET /v1/config` directly in app code.

On load, the page also requests a MetaMask connection, auto-fills the connected
wallet address, and still allows the user to edit the `prove()` user address manually.

## Run

```bash
npm install
npm run dev
```

Open the printed URL (default `http://127.0.0.1:5173`).

For production builds without the dev server, the Gateway and Primus hosts still
need to allow **CORS** from your origin, or you need to run behind a reverse proxy.

```bash
npm run build
npm run preview
```

## SDK version

This demo depends on `@superorange/bnbzkid-js-sdk@^0.1.0`. Bump the version in `package.json` if you publish a newer SDK.

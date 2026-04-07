import type { ProviderOption } from "./sdk-demo-types";

type DemoControlsProps = {
  userAddress: string;
  setUserAddress: (value: string) => void;
  walletError: string | null;
  initError: string | null;
  providerOptions: ProviderOption[];
  selectedPropertyId: string;
  setSelectedPropertyId: (value: string) => void;
  running: boolean;
};

export function DemoControls({
  userAddress,
  setUserAddress,
  walletError,
  initError,
  providerOptions,
  selectedPropertyId,
  setSelectedPropertyId,
  running
}: DemoControlsProps) {
  return (
    <div className="controls">
      <div className="field">
        <label htmlFor="user-address">User address (prove input)</label>
        <input
          id="user-address"
          value={userAddress}
          onChange={(e) => setUserAddress(e.target.value)}
          placeholder="Connect MetaMask to populate, or edit manually"
          autoComplete="off"
        />
      </div>

      <div className="field">
        <label htmlFor="brevis-provider">
          Provider (from <code>init()</code> result)
        </label>
        <select
          id="brevis-provider"
          value={selectedPropertyId}
          onChange={(e) => setSelectedPropertyId(e.target.value)}
          disabled={providerOptions.length === 0 || running}
        >
          {providerOptions.map((row) => (
            <option
              key={row.identityPropertyId}
              value={row.identityPropertyId}
              title={`${row.propertyDescription} (${row.identityPropertyId})`}
            >
              {row.providerDescription} · {row.propertyDescription}
            </option>
          ))}
        </select>
      </div>

      <p className="hint">
        This demo auto-connects MetaMask on page load and uses the connected wallet address as the{" "}
        <code>prove()</code> user address. A Primus browser extension environment is still required
        to complete <code>prove()</code>.
      </p>
      {walletError ? <p className="hint">Wallet error: {walletError}</p> : null}
      {initError ? <p className="hint">Init error: {initError}</p> : null}
    </div>
  );
}

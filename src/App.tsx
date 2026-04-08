import { useEffect, useRef, useState } from "react";
import { BnbZkIdClient, BnbZkIdProveError, type ProveInput } from "@primuslabs/bnb-zkid-sdk";
import { DemoLog } from "./demo-log";
import { SDK_DEMO_APP_ID, type LogEntry, type ProviderOption } from "./sdk-demo-types";
import { flattenProviderOptions, formatError } from "./sdk-demo-utils";
import { useMetaMaskWallet } from "./use-metamask-wallet";

export default function App() {
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([]);
  const [initError, setInitError] = useState<string | null>(null);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [extensionDetected, setExtensionDetected] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string | null>(null);
  const [runOutcome, setRunOutcome] = useState<"success" | "failed" | null>(null);

  const clientRef = useRef<BnbZkIdClient | null>(null);
  const { userAddress, setUserAddress, walletError, isWalletConnected, connectWallet, disconnectWallet } =
    useMetaMaskWallet();

  useEffect(() => {
    let cancelled = false;
    setInitError(null);

    void (async () => {
      try {
        const client = new BnbZkIdClient();
        clientRef.current = client;
        const initResult = await client.init({
          appId: SDK_DEMO_APP_ID
        });

        if (cancelled) {
          return;
        }

        if (!initResult.success) {
          setProviderOptions([]);
          setInitError(
            initResult.error ? JSON.stringify(initResult.error, null, 2) : "SDK init failed."
          );
          return;
        }

        const rows = flattenProviderOptions(initResult.providers);
        setProviderOptions(rows);
      } catch (err) {
        if (cancelled) {
          return;
        }
        setProviderOptions([]);
        setInitError(formatError(err));
      }
    })();

    return () => {
      cancelled = true;
      clientRef.current = null;
    };
  }, []);

  useEffect(() => {
    const checkExtension = () => {
      const hasPrimus = Boolean((window as Window & { primus?: unknown }).primus);
      setExtensionDetected(hasPrimus);
    };
    checkExtension();
    const id = window.setInterval(checkExtension, 500);
    return () => window.clearInterval(id);
  }, []);

  const appendLog = (text: string) => {
    setLogEntries((prev) => [...prev, { kind: "text", text }]);
  };

  const appendOutcome = (success: boolean) => {
    setLogEntries((prev) => [...prev, { kind: "outcome", success }]);
  };

  const hasWalletAddress = userAddress.trim().length > 0;
  const canRunProve = !running && providerOptions.length > 0 && hasWalletAddress;

  const runDemo = async (selectedOption: ProviderOption) => {
    setLogEntries([]);
    setProgressStatus(null);
    setRunOutcome(null);
    setRunning(true);

    let runSucceeded: boolean | null = null;

    try {
      const client = clientRef.current;
      if (!client) {
        appendLog("error: SDK client is not initialized");
        runSucceeded = false;
        return;
      }

      if (providerOptions.length === 0) {
        appendLog(
          initError
            ? `Failed to initialize SDK - ${initError}`
            : "Provider list is empty after SDK init."
        );
        runSucceeded = false;
        return;
      }

      const connectedUserAddress = userAddress.trim();
      if (!connectedUserAddress) {
        appendLog(
          walletError
            ? `Failed to get MetaMask wallet address - ${walletError}`
            : "No MetaMask wallet address is connected."
        );
        runSucceeded = false;
        return;
      }

      if (!extensionDetected) {
        appendLog("Primus extension is not detected. Please install and enable the extension first.");
        runSucceeded = false;
        return;
      }

      const identityPropertyId = selectedOption.identityPropertyId;
      if (!identityPropertyId) {
        appendLog("error: no identity property id");
        runSucceeded = false;
        return;
      }

      const proveInput: ProveInput = {
        clientRequestId: new Date().getTime().toString(),
        userAddress: connectedUserAddress,
        identityPropertyId
      };

      const proveResult = await client.prove(proveInput, {
        onProgress(event) {
          setProgressStatus(event.status);
        }
      });

      appendLog(`prove: ${JSON.stringify(proveResult, null, 2)}`);
      runSucceeded = true;
    } catch (error) {
      runSucceeded = false;
      if (error instanceof BnbZkIdProveError) {
        appendLog(`error: ${JSON.stringify(error.toJSON(), null, 2)}`);
      } else {
        appendLog(`error: ${formatError(error)}`);
      }
    } finally {
      if (runSucceeded !== null) {
        appendOutcome(runSucceeded);
        setRunOutcome(runSucceeded ? "success" : "failed");
      }
      setRunning(false);
    }
  };

  return (
    <>
      <main className="app-main">
        <div className="panel">
          <header className="panel-header">
            <div>
              <h1>ZKID SDK Integration Live Demo</h1>
              <p>
                A step-by-step walkthrough of integrating zkTLS and zkVM workflow into the Lista
                dApp frontend.
              </p>
            </div>
          </header>

          <section className="step-card">
            <div className="step-head">
              <h2>Step 1 Connect Wallet</h2>
              <button
                type="button"
                className="btn-secondary wallet-btn"
                onClick={() => (isWalletConnected ? disconnectWallet() : void connectWallet())}
                disabled={running}
              >
                {isWalletConnected ? "Disconnect Wallet" : "Connect Wallet"}
              </button>
            </div>
            <div className="field">
              <label htmlFor="user-address">User Address</label>
              <input
                id="user-address"
                value={userAddress}
                onChange={(e) => setUserAddress(e.target.value)}
                placeholder="Connect MetaMask to populate, or edit manually"
                autoComplete="off"
              />
            </div>
            {walletError ? <p className="hint">Wallet error: {walletError}</p> : null}
            {initError ? <p className="hint">Init error: {initError}</p> : null}
          </section>

          <section className="step-card">
            <div className="step-head">
              <h2>Step 2 Proof Generation</h2>
            </div>
            <div className="provider-grid">
              {providerOptions.map((option) => (
                <button
                  key={option.identityPropertyId}
                  type="button"
                  className="provider-btn"
                  disabled={!canRunProve}
                  onClick={() => void runDemo(option)}
                  title={`${option.propertyDescription} (${option.identityPropertyId})`}
                >
                  <span className="provider-btn-title">{option.providerDescription}</span>
                  <span className="provider-btn-subtitle">{option.propertyDescription}</span>
                </button>
              ))}
            </div>
          </section>

          <DemoLog
            entries={logEntries}
            running={running}
            progressStatus={progressStatus}
            runOutcome={runOutcome}
          />
        </div>
      </main>
    </>
  );
}

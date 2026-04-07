import { useEffect, useRef, useState } from "react";
import { BnbZkIdClient, BnbZkIdProveError, type ProveInput } from "@primuslabs/bnb-zkid-sdk";
import { DemoControls } from "./demo-controls";
import { DemoLog } from "./demo-log";
import { SDK_DEMO_APP_ID, type LogEntry, type ProviderOption } from "./sdk-demo-types";
import { flattenProviderOptions, formatError } from "./sdk-demo-utils";
import { useMetaMaskWallet } from "./use-metamask-wallet";

export default function App() {
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([]);
  const [initError, setInitError] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);

  const clientRef = useRef<BnbZkIdClient | null>(null);
  const { userAddress, setUserAddress, walletError } = useMetaMaskWallet();

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
        setSelectedPropertyId((prev) => {
          if (prev && rows.some((r) => r.identityPropertyId === prev)) {
            return prev;
          }
          return rows[0]?.identityPropertyId ?? "";
        });
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

  const appendLog = (text: string) => {
    setLogEntries((prev) => [...prev, { kind: "text", text }]);
  };

  const appendOutcome = (success: boolean) => {
    setLogEntries((prev) => [...prev, { kind: "outcome", success }]);
  };

  const clearLog = () => setLogEntries([]);

  const selectedOption = providerOptions.find((r) => r.identityPropertyId === selectedPropertyId);

  const runDemo = async () => {
    setLogEntries([]);
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

      appendLog(
        `provider: ${selectedOption?.providerDescription ?? ""} — ${selectedOption?.propertyDescription ?? ""} (${selectedOption?.identityPropertyId ?? ""})`
      );

      const identityPropertyId =
        selectedOption?.identityPropertyId ?? providerOptions[0]?.identityPropertyId;
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
          appendLog(`progress: ${event.status} ${event.proofRequestId ?? ""}`.trim());
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
      }
      setRunning(false);
    }
  };

  return (
    <>
      <main className="app-main">
        <div className="panel">
          <h1>BNB ZKID SDK Demo</h1>
          <p>
            A minimal browser demo for <code>BnbZkIdClient</code> from{" "}
            <code>@primuslabs/bnb-zkid-sdk</code>. It initializes the SDK once, uses the returned
            provider list to render the selector, and runs <code>prove()</code> with the selected
            property.
          </p>

          <DemoControls
            userAddress={userAddress}
            setUserAddress={setUserAddress}
            walletError={walletError}
            initError={initError}
            providerOptions={providerOptions}
            selectedPropertyId={selectedPropertyId}
            setSelectedPropertyId={setSelectedPropertyId}
            running={running}
          />

          <div className="row">
            <button
              type="button"
              className="btn-primary"
              onClick={() => void runDemo()}
              disabled={running || providerOptions.length === 0}
            >
              Run Prove
            </button>
            <button type="button" className="btn-secondary" onClick={clearLog}>
              Clear
            </button>
          </div>

          <DemoLog entries={logEntries} />
        </div>
      </main>
    </>
  );
}

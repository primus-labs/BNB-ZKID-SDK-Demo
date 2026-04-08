import { useCallback, useEffect, useRef, useState } from "react";
import {
  BnbZkIdClient,
  BnbZkIdProveError,
  type ProveInput
} from "@primuslabs/bnb-zkid-sdk";
import { DemoLog } from "./demo-log";
import {
  FALLBACK_PROVIDER_OPTIONS,
  SDK_DEMO_APP_ID,
  type LogEntry,
  type ProviderOption
} from "./sdk-demo-types";
import { flattenProviderOptions, formatError } from "./sdk-demo-utils";
import { useMetaMaskWallet } from "./use-metamask-wallet";

type AlertModalState = {
  title: string;
  description: string;
  detail?: string;
};

function isPrimusExtensionPresent(): boolean {
  return Boolean((window as Window & { primus?: unknown }).primus);
}

function formatInitFailureForModal(error: unknown): AlertModalState {
  if (error !== null && typeof error === "object" && "message" in error) {
    const e = error as {
      code?: string;
      message: string;
      details?: { primus?: { message?: string; code?: string } };
    };
    const primusHint = e.details?.primus?.message;
    if (e.code === "00000") {
      return {
        title: "Primus extension required",
        description: e.message || "Install the Primus browser extension to generate zkTLS proofs.",
        detail: primusHint
      };
    }
    return {
      title: "Could not initialize SDK",
      description: e.message || "Something went wrong during initialization.",
      detail: primusHint
    };
  }
  return {
    title: "Could not initialize SDK",
    description: typeof error === "string" ? error : "Unknown error."
  };
}

function formatErrorForLogWithoutDetails(error: unknown): string {
  if (error !== null && typeof error === "object") {
    const errObj = error as Record<string, unknown>;
    if ("details" in errObj) {
      const sanitized = { ...errObj };
      delete sanitized.details;
      return JSON.stringify(sanitized, null, 2);
    }
  }
  return formatError(error);
}

export default function App() {
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string | null>(null);
  const [runOutcome, setRunOutcome] = useState<"success" | "failed" | null>(null);
  const [alertModal, setAlertModal] = useState<AlertModalState | null>(null);

  const clientRef = useRef<BnbZkIdClient | null>(null);
  const { userAddress, setUserAddress, walletError, isWalletConnected, connectWallet, disconnectWallet } =
    useMetaMaskWallet();

  const closeModal = useCallback(() => {
    setAlertModal(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

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
          setProvidersLoading(false);
          return;
        }

        const rows = flattenProviderOptions(initResult.providers);
        setProviderOptions(rows);
        setProvidersLoading(false);
      } catch (err) {
        if (cancelled) {
          return;
        }
        setProviderOptions([]);
        setProvidersLoading(false);
        console.error("SDK init error:", err);
      }
    })();

    return () => {
      cancelled = true;
      clientRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!alertModal) {
      return;
    }
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        closeModal();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [alertModal, closeModal]);

  const appendLog = (text: string) => {
    setLogEntries((prev) => [...prev, { kind: "text", text }]);
  };

  const hasWalletAddress = userAddress.trim().length > 0;
  const displayProviderOptions = providersLoading
    ? []
    : providerOptions.length > 0
      ? providerOptions
      : FALLBACK_PROVIDER_OPTIONS;
  const canRunProve = !running && hasWalletAddress;

  const runProveFlow = async (selectedOption: ProviderOption, connectedUserAddress: string) => {
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
        appendLog(`error: ${formatErrorForLogWithoutDetails(error.toJSON())}`);
      } else {
        appendLog(`error: ${formatError(error)}`);
      }
    } finally {
      if (runSucceeded !== null) {
        setRunOutcome(runSucceeded ? "success" : "failed");
      }
      setRunning(false);
    }
  };

  const handleProviderClick = async (selectedOption: ProviderOption) => {
    if (running) {
      return;
    }

    const connectedUserAddress = userAddress.trim();
    if (!connectedUserAddress) {
      return;
    }

    if (!isPrimusExtensionPresent()) {
      setAlertModal({
        title: "Primus extension required",
        description:
          "The Primus browser extension was not detected. Install it, pin it, reload this page, then try again.",
        detail: "ZKTLS proof generation runs inside the extension. Without it, the demo cannot continue."
      });
      return;
    }

    const client = clientRef.current;
    if (!client) {
      setAlertModal({
        title: "SDK not ready",
        description: "The client is still loading or the page needs a refresh. Please wait a moment and try again."
      });
      return;
    }

    let effectiveRows = providerOptions;
    if (effectiveRows.length === 0) {
      const initResult = await client.init({ appId: SDK_DEMO_APP_ID });
      if (!initResult.success) {
        setAlertModal(formatInitFailureForModal(initResult.error));
        return;
      }
      effectiveRows = flattenProviderOptions(initResult.providers);
      setProviderOptions(effectiveRows);
    }

    const allowedIds = new Set(effectiveRows.map((r) => r.identityPropertyId));
    if (!allowedIds.has(selectedOption.identityPropertyId)) {
      setAlertModal({
        title: "Identity not available",
        description:
          "This proof type is not enabled for the current Gateway configuration. Pick another option after SDK init succeeds."
      });
      return;
    }

    await runProveFlow(selectedOption, connectedUserAddress);
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
                placeholder="Connect MetaMask to continue. This address will be bound to each proof."
                autoComplete="off"
              />
            </div>
            {walletError ? <p className="hint">Wallet error: {walletError}</p> : null}
          </section>

          <section className="step-card">
            <div className="step-head">
              <h2>Step 2 Proof Generation</h2>
            </div>
            {providersLoading ? (
              <div className="provider-grid provider-grid--loading" aria-label="Loading providers">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} className="provider-skeleton" aria-hidden />
                ))}
              </div>
            ) : (
              <div className="provider-grid">
                {displayProviderOptions.map((option) => (
                  <button
                    key={option.identityPropertyId}
                    type="button"
                    className="provider-btn"
                    disabled={!canRunProve}
                    onClick={() => void handleProviderClick(option)}
                    title={`${option.propertyDescription} (${option.identityPropertyId})`}
                  >
                    <span className="provider-btn-title">{option.providerDescription}</span>
                    <span className="provider-btn-subtitle">{option.propertyDescription}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <DemoLog
            entries={logEntries}
            running={running}
            progressStatus={progressStatus}
            runOutcome={runOutcome}
          />
        </div>
      </main>

      {alertModal ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeModal();
            }
          }}
        >
          <div
            className="modal-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="demo-alert-title"
            aria-describedby="demo-alert-desc"
          >
            <div className="modal-dialog__header">
              <span className="modal-dialog__icon" aria-hidden>
                !
              </span>
              <h3 id="demo-alert-title" className="modal-dialog__title">
                {alertModal.title}
              </h3>
            </div>
            <p id="demo-alert-desc" className="modal-dialog__body">
              {alertModal.description}
            </p>
            {alertModal.detail ? <p className="modal-dialog__detail">{alertModal.detail}</p> : null}
            <div className="modal-dialog__actions">
              <button type="button" className="modal-dialog__btn" onClick={closeModal}>
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

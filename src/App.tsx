import { useCallback, useEffect, useRef, useState } from "react";
import {
  BnbZkIdClient,
  BnbZkIdProveError,
  type InitResult,
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

const EXTENSION_INSTALL_URL = "https://github.com/primus-labs/BNB-ZKID-SDK/tree/main/extension";

type AlertModalState = {
  title: string;
  subtitle?: string;
  description: string;
  detail?: string;
  extensionBullets?: { ok: boolean; text: string }[];
  showEnableExtension?: boolean;
};

const GATEWAY_CONFIG_URL = "https://zk-id.brevis.network/v1/config";
const PROOF_STATUS_ORDER = ["initializing", "data_verifying", "proof_generating", "on_chain_attested"] as const;
type ProofStatusKey = (typeof PROOF_STATUS_ORDER)[number] | "failed";

const PROOF_STATUS_LABELS: Record<ProofStatusKey, string> = {
  initializing: "Initializing",
  data_verifying: "Data Verifying",
  proof_generating: "Proof Generating",
  on_chain_attested: "On-chain Submitting",
  failed: "Failed"
};

type GatewayConfigResponse = {
  providers?: unknown;
};

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
        title: "Primus Extension Required",
        subtitle: "Assist in verifying your data",
        description: "",
        extensionBullets: [
          { ok: true, text: "Assist you to generate ZK proofs of your data." },
          { ok: true, text: "Maintain full privacy throughout the verification process." },
          { ok: false, text: "Your data is never accessed or tracked by Primus." }
        ],
        showEnableExtension: true
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

function isInitFailureResult(result: InitResult): result is Extract<InitResult, { success: false }> {
  return result.success === false;
}

async function initClientWithRetry(client: BnbZkIdClient): Promise<InitResult> {
  const first = await client.init({ appId: SDK_DEMO_APP_ID });
  if (!isInitFailureResult(first) || first.error?.code !== "00000") {
    return first;
  }
  // Give the extension injection pipeline a brief chance to settle before final verdict.
  await new Promise((resolve) => window.setTimeout(resolve, 450));
  return client.init({ appId: SDK_DEMO_APP_ID });
}

export default function App() {
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [progressStatusTrail, setProgressStatusTrail] = useState<ProofStatusKey[]>([]);
  const [finalProofResult, setFinalProofResult] = useState<string | null>(null);
  const [alertModal, setAlertModal] = useState<AlertModalState | null>(null);
  const [proofModalOpen, setProofModalOpen] = useState(false);

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
        let rows: ProviderOption[] = [];
        try {
          rows = await fetchProviderOptionsFromGateway();
        } catch (providerError) {
          console.error("Gateway provider fetch error:", providerError);
        }

        if (rows.length === 0) {
          const initResult = await client.init({
            appId: SDK_DEMO_APP_ID
          });

          if (cancelled) {
            return;
          }

          if (initResult.success) {
            rows = flattenProviderOptions(initResult.providers);
          }
        }
        setProviderOptions(rows);
      } catch (err) {
        if (cancelled) {
          return;
        }
        setProviderOptions([]);
        console.error("SDK init error:", err);
      } finally {
        if (!cancelled) {
          setProvidersLoading(false);
        }
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

  const appendProofStatus = (status: ProofStatusKey) => {
    if (!PROOF_STATUS_ORDER.includes(status as (typeof PROOF_STATUS_ORDER)[number])) {
      return;
    }
    setProgressStatusTrail((prev) => (prev.includes(status) ? prev : [...prev, status]));
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
    setProgressStatusTrail([]);
    setFinalProofResult(null);
    setRunning(true);
    setProofModalOpen(true);

    try {
      const client = clientRef.current;
      if (!client) {
        appendLog("error: SDK client is not initialized");
        return;
      }

      const identityPropertyId = selectedOption.identityPropertyId;
      if (!identityPropertyId) {
        appendLog("error: no identity property id");
        return;
      }

      const proveInput: ProveInput = {
        clientRequestId: new Date().getTime().toString(),
        userAddress: connectedUserAddress,
        identityPropertyId
      };

      const proveResult = await client.prove(proveInput, {
        onProgress(event) {
          appendProofStatus(event.status as ProofStatusKey);
        }
      });

      appendProofStatus("on_chain_attested");
      setFinalProofResult(
        `On-chain result: ${proveResult.status}${proveResult.proofRequestId ? ` (ProofRequestId: ${proveResult.proofRequestId})` : ""}`
      );
      appendLog(`prove: ${JSON.stringify(proveResult, null, 2)}`);
    } catch (error) {
      if (error instanceof BnbZkIdProveError) {
        appendLog(`error: ${formatErrorForLogWithoutDetails(error.toJSON())}`);
      } else {
        appendLog(`error: ${formatError(error)}`);
      }
      setProofModalOpen(false);
    } finally {
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
      try {
        effectiveRows = await fetchProviderOptionsFromGateway();
      } catch (providerError) {
        console.error("Gateway provider fetch error:", providerError);
      }
    }

    // Always initialize before prove(). SDK throws if prove is called before successful init.
    const initResult = await initClientWithRetry(client);
    if (!initResult.success) {
      setAlertModal(formatInitFailureForModal(initResult.error));
      return;
    }

    const initRows = flattenProviderOptions(initResult.providers);
    if (initRows.length > 0) {
      effectiveRows = initRows;
      setProviderOptions(initRows);
    } else if (effectiveRows.length > 0) {
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
          />
        </div>
      </main>

      {proofModalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (!running && finalProofResult && e.target === e.currentTarget) {
              setProofModalOpen(false);
            }
          }}
        >
          <div className="modal-dialog modal-dialog--progress" role="dialog" aria-modal="true">
            <div className="modal-dialog__header">
              <h3 className="modal-dialog__title">Proof in progress</h3>
            </div>
            <div className="progress-modal-list" role="status" aria-live="polite">
              {(() => {
                const activeStepIndex =
                  progressStatusTrail.length > 0
                    ? PROOF_STATUS_ORDER.findIndex(
                        (step) => step === progressStatusTrail[progressStatusTrail.length - 1]
                      )
                    : 0;
                const visibleSteps = PROOF_STATUS_ORDER.slice(0, Math.max(1, activeStepIndex + 1));
                return visibleSteps.map((step, index) => {
                  const isDone = index < activeStepIndex || (!running && finalProofResult !== null);
                  const isActive = index === activeStepIndex && running;
                  return (
                    <div
                      key={step}
                      className={`progress-modal-item ${isDone ? "is-done" : ""} ${isActive ? "is-active" : ""}`}
                    >
                      {isDone ? (
                        <span className="progress-modal-check" aria-hidden>
                          ✓
                        </span>
                      ) : (
                        <span className="progress-modal-spinner" aria-hidden />
                      )}
                      <span>{PROOF_STATUS_LABELS[step]}</span>
                    </div>
                  );
                });
              })()}
              {finalProofResult ? <div className="progress-modal-result">{finalProofResult}</div> : null}
            </div>
            {!running && finalProofResult ? (
              <div className="modal-dialog__actions">
                <button type="button" className="modal-dialog__btn" onClick={() => setProofModalOpen(false)}>
                  OK
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

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
            className={`modal-dialog${alertModal.extensionBullets?.length ? " modal-dialog--extension" : ""}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={
              alertModal.subtitle ? "demo-alert-title demo-alert-subtitle" : "demo-alert-title"
            }
            aria-describedby={(() => {
              const parts: string[] = [];
              if (alertModal.description.trim()) {
                parts.push("demo-alert-desc");
              }
              if (alertModal.extensionBullets?.length) {
                parts.push("demo-alert-bullets");
              }
              return parts.length > 0 ? parts.join(" ") : undefined;
            })()}
          >
            <div
              className={`modal-dialog__header${alertModal.subtitle ? " modal-dialog__header--stack" : ""}`}
            >
              {!alertModal.showEnableExtension ? (
                <span className="modal-dialog__icon" aria-hidden>
                  !
                </span>
              ) : null}
              <div className="modal-dialog__head-text">
                <h3 id="demo-alert-title" className="modal-dialog__title">
                  {alertModal.title}
                </h3>
                {alertModal.subtitle ? (
                  <p id="demo-alert-subtitle" className="modal-dialog__subtitle">
                    {alertModal.subtitle}
                  </p>
                ) : null}
              </div>
            </div>
            {alertModal.description.trim() ? (
              <p id="demo-alert-desc" className="modal-dialog__body">
                {alertModal.description}
              </p>
            ) : null}
            {alertModal.extensionBullets && alertModal.extensionBullets.length > 0 ? (
              <ul id="demo-alert-bullets" className="modal-dialog__extension-box">
                {alertModal.extensionBullets.map((item, idx) => (
                  <li key={idx} className="modal-dialog__extension-item">
                    <span
                      className={
                        item.ok ? "modal-dialog__mark modal-dialog__mark--ok" : "modal-dialog__mark modal-dialog__mark--no"
                      }
                      aria-hidden
                    >
                      {item.ok ? "✓" : "✕"}
                    </span>
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {alertModal.detail ? <p className="modal-dialog__detail">{alertModal.detail}</p> : null}
            {alertModal.showEnableExtension ? (
              <div className="modal-dialog__enable-wrap">
                <a
                  className="modal-dialog__btn-enable"
                  href={EXTENSION_INSTALL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Enable Extension
                </a>
              </div>
            ) : null}
            {!alertModal.showEnableExtension ? (
              <div className="modal-dialog__actions">
                <button type="button" className="modal-dialog__btn" onClick={closeModal}>
                  OK
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

async function fetchProviderOptionsFromGateway(): Promise<ProviderOption[]> {
  const response = await fetch(GATEWAY_CONFIG_URL, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Gateway config request failed: HTTP ${response.status}`);
  }
  const payload = (await response.json()) as GatewayConfigResponse;
  if (!Array.isArray(payload.providers)) {
    return [];
  }
  return flattenProviderOptions(payload.providers as Parameters<typeof flattenProviderOptions>[0]);
}

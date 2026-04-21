import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { bscTestnet } from "viem/chains";
import { getAddress } from "viem";
import {
  BnbZkIdClient,
  BnbZkIdProveError,
  type InitSuccessResult,
  type ProveInput,
  type ProveSuccessResult
} from "@primuslabs/bnb-zkid-sdk";
import { getBnbTestnetIdentityRegistryAddress } from "./demo-registry-config";
import {
  decodeDataBlobByIdentityProperty,
  identityPropertyIdToChainBytes32,
  normalizeProveProviderIdToBytes32
} from "./decode-attestation";
import { DemoLog } from "./demo-log";
import { fetchLatestIdentityPropertyFromRegistry } from "./fetch-latest-identity-property";
import {
  AMAZON_MARKETPLACES,
  isAmazonProviderOption
} from "./amazon-marketplaces";
import {
  FALLBACK_PROVIDER_OPTIONS,
  SDK_DEMO_APP_ID,
  type LogEntry,
  type ProviderOption
} from "./sdk-demo-types";
import { flattenProviderOptions, formatError } from "./sdk-demo-utils";
import { useMetaMaskWallet } from "./use-metamask-wallet";

const EXTENSION_INSTALL_URL =
  "https://chromewebstore.google.com/detail/primus/oeiomhmbaapihbilkfkhmlajkeegnjhe";

/** Set when user clicks “Enable Extension”; cleared after a reload once `window.primus` is present. */
const EXTENSION_INSTALL_PENDING_KEY = "bnbzkid-demo-extension-install-pending";

type AlertModalState = {
  title: string;
  subtitle?: string;
  description: string;
  /** Shown when {@link description} had a raw Chrome Web Store URL stripped out. */
  storeLink?: { href: string; label: string };
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

function isPrimusExtensionPresent(): boolean {
  return Boolean((window as Window & { primus?: unknown }).primus);
}

function readExtensionInstallPending(): boolean {
  try {
    return localStorage.getItem(EXTENSION_INSTALL_PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

function setExtensionInstallPending(): void {
  try {
    localStorage.setItem(EXTENSION_INSTALL_PENDING_KEY, "1");
  } catch {
    /* private / blocked storage */
  }
}

function clearExtensionInstallPending(): void {
  try {
    localStorage.removeItem(EXTENSION_INSTALL_PENDING_KEY);
  } catch {
    /* private / blocked storage */
  }
}

function primusExtensionRequiredModal(): AlertModalState {
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

function getProveErrorCode(error: unknown): string | undefined {
  if (error instanceof BnbZkIdProveError) {
    return error.proveCode;
  }
  if (error !== null && typeof error === "object") {
    const o = error as Record<string, unknown>;
    if (typeof o.proveCode === "string") {
      return o.proveCode;
    }
    if ("code" in o) {
      const c = o.code;
      return typeof c === "string" ? c : undefined;
    }
  }
  return undefined;
}

/** Handles duplicate package instances where `instanceof BnbZkIdProveError` may be false. */
function isExtensionMissingInitError(error: unknown): boolean {
  if (error instanceof BnbZkIdProveError && error.proveCode === "00000") {
    return true;
  }
  const code = getProveErrorCode(error);
  if (code === "00000") {
    return true;
  }
  const msg =
    error !== null &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
      ? (error as { message: string }).message
      : typeof error === "string"
        ? error
        : "";
  return (
    /chromewebstore\.google\.com\/detail\/primus/i.test(msg) ||
    /primus extension not detected/i.test(msg)
  );
}

const CHROME_STORE_URL_IN_PARENS_RE =
  /\s*\(\s*https:\/\/chromewebstore\.google\.com\/detail\/primus\/[a-z0-9]+\s*\)/gi;
const CHROME_STORE_URL_BARE_RE =
  /https:\/\/chromewebstore\.google\.com\/detail\/primus\/[a-z0-9]+/gi;

/**
 * Removes inlined Chrome Web Store URLs from SDK copy and returns a short label link instead.
 */
function beautifyDescriptionWithStoreLink(raw: string): Pick<AlertModalState, "description" | "storeLink"> {
  const trimmed = raw.trim();
  const hasParenUrl = CHROME_STORE_URL_IN_PARENS_RE.test(trimmed);
  CHROME_STORE_URL_IN_PARENS_RE.lastIndex = 0;
  const hasBareUrl = CHROME_STORE_URL_BARE_RE.test(trimmed);
  CHROME_STORE_URL_BARE_RE.lastIndex = 0;
  if (!hasParenUrl && !hasBareUrl) {
    return { description: trimmed };
  }
  let description = trimmed
    .replace(CHROME_STORE_URL_IN_PARENS_RE, "")
    .replace(CHROME_STORE_URL_BARE_RE, "")
    .trim();
  description = description.replace(/\s+,/g, ",").replace(/\s{2,}/g, " ").trim();
  if (description === "") {
    description = "Please install and enable the Primus extension, then try again.";
  }
  return {
    description,
    storeLink: { href: EXTENSION_INSTALL_URL, label: "Open Chrome Web Store" }
  };
}

function formatInitFailureForModal(error: unknown): AlertModalState {
  if (isExtensionMissingInitError(error)) {
    return primusExtensionRequiredModal();
  }
  if (error instanceof BnbZkIdProveError) {
    return {
      title: "Could not initialize SDK",
      ...beautifyDescriptionWithStoreLink(error.message || "Something went wrong during initialization.")
    };
  }
  if (error !== null && typeof error === "object" && "message" in error) {
    const e = error as {
      code?: string;
      message: string;
      details?: { primus?: { message?: string; code?: string } };
    };
    const primusHint = e.details?.primus?.message;
    return {
      title: "Could not initialize SDK",
      ...beautifyDescriptionWithStoreLink(e.message || "Something went wrong during initialization."),
      detail: primusHint
    };
  }
  return {
    title: "Could not initialize SDK",
    ...beautifyDescriptionWithStoreLink(
      typeof error === "string" ? error : "Unknown error."
    )
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

type InitClientOutcome = InitSuccessResult | { success: false; error: unknown };

async function initClientWithRetry(client: BnbZkIdClient): Promise<InitClientOutcome> {
  try {
    return await client.init({ appId: SDK_DEMO_APP_ID });
  } catch (firstError) {
    if (getProveErrorCode(firstError) !== "00000") {
      return { success: false, error: firstError };
    }
    // Give the extension injection pipeline a brief chance to settle before final verdict.
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    try {
      return await client.init({ appId: SDK_DEMO_APP_ID });
    } catch (secondError) {
      return { success: false, error: secondError };
    }
  }
}

function jsonWithBigInt(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v), 2);
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
  const [lastProveSuccess, setLastProveSuccess] = useState<ProveSuccessResult | null>(null);
  const [decodeRegistryLoading, setDecodeRegistryLoading] = useState(false);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [decodeOutput, setDecodeOutput] = useState<string | null>(null);
  const [amazonRegionModal, setAmazonRegionModal] = useState<{
    selectedOption: ProviderOption;
    connectedUserAddress: string;
  } | null>(null);
  const [amazonMarketId, setAmazonMarketId] = useState<string>("");
  const [amazonRegionMenuOpen, setAmazonRegionMenuOpen] = useState(false);
  const [amazonRegionMenuPosition, setAmazonRegionMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const amazonSelectTriggerRef = useRef<HTMLButtonElement | null>(null);
  const amazonSelectMenuRef = useRef<HTMLDivElement | null>(null);

  const clientRef = useRef<BnbZkIdClient | null>(null);
  const { userAddress, setUserAddress, walletError, isWalletConnected, connectWallet, disconnectWallet } =
    useMetaMaskWallet();

  const canDecodeViaRegistry = useMemo(() => {
    const r = lastProveSuccess;
    if (!r?.walletAddress?.trim() || !r.providerId?.trim() || !r.identityPropertyId?.trim()) {
      return false;
    }
    return (
      normalizeProveProviderIdToBytes32(r.providerId) !== undefined &&
      identityPropertyIdToChainBytes32(r.identityPropertyId) !== undefined
    );
  }, [lastProveSuccess]);

  const closeModal = useCallback(() => {
    setAlertModal(null);
  }, []);

  const closeAmazonRegionModal = useCallback(() => {
    setAmazonRegionModal(null);
    setAmazonRegionMenuOpen(false);
    setAmazonRegionMenuPosition(null);
  }, []);

  useEffect(() => {
    if (!readExtensionInstallPending()) {
      return;
    }
    if (isPrimusExtensionPresent()) {
      clearExtensionInstallPending();
      return;
    }
    setAlertModal(primusExtensionRequiredModal());
  }, []);

  useEffect(() => {
    let sawHidden = false;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        sawHidden = true;
        return;
      }
      if (document.visibilityState !== "visible") {
        return;
      }
      if (!sawHidden) {
        return;
      }
      if (!readExtensionInstallPending()) {
        return;
      }
      window.location.reload();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
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
          try {
            const initResult = await client.init({
              appId: SDK_DEMO_APP_ID
            });
            if (cancelled) {
              return;
            }
            rows = flattenProviderOptions(initResult.providers);
          } catch (initErr) {
            if (cancelled) {
              return;
            }
            console.error("SDK init error (bootstrap providers):", initErr);
          }
        }
        setProviderOptions(rows);
      } catch (err) {
        if (cancelled) {
          return;
        }
        setProviderOptions([]);
        console.error("SDK bootstrap error:", err);
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

  useEffect(() => {
    if (!amazonRegionModal) {
      return;
    }
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        if (amazonRegionMenuOpen) {
          setAmazonRegionMenuOpen(false);
          return;
        }
        closeAmazonRegionModal();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [amazonRegionModal, amazonRegionMenuOpen, closeAmazonRegionModal]);

  useEffect(() => {
    if (!amazonRegionModal) {
      setAmazonRegionMenuOpen(false);
      setAmazonRegionMenuPosition(null);
    }
  }, [amazonRegionModal]);

  useEffect(() => {
    if (!amazonRegionModal || !amazonRegionMenuOpen) {
      setAmazonRegionMenuPosition(null);
      return;
    }
    const updatePosition = () => {
      const triggerEl = amazonSelectTriggerRef.current;
      if (!triggerEl) {
        setAmazonRegionMenuPosition(null);
        return;
      }
      const rect = triggerEl.getBoundingClientRect();
      setAmazonRegionMenuPosition({
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [amazonRegionModal, amazonRegionMenuOpen]);

  useEffect(() => {
    if (!amazonRegionMenuOpen) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (amazonSelectTriggerRef.current?.contains(target) || amazonSelectMenuRef.current?.contains(target)) {
        return;
      }
      setAmazonRegionMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [amazonRegionMenuOpen]);

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

  const openProgressModalAtInitializing = useCallback(() => {
    setLogEntries([]);
    setProgressStatusTrail(["initializing"]);
    setFinalProofResult(null);
    setLastProveSuccess(null);
    setDecodeError(null);
    setDecodeOutput(null);
    setDecodeRegistryLoading(false);
    setRunning(true);
    setProofModalOpen(true);
  }, []);

  const runProveFlow = async (
    selectedOption: ProviderOption,
    connectedUserAddress: string,
    proveExtras?: { jumpToUrl?: string },
    options?: { progressModalPrimed?: boolean }
  ) => {
    if (!options?.progressModalPrimed) {
      setLogEntries([]);
      setProgressStatusTrail([]);
      setFinalProofResult(null);
      setLastProveSuccess(null);
      setDecodeError(null);
      setDecodeOutput(null);
      setDecodeRegistryLoading(false);
      setRunning(true);
      setProofModalOpen(true);
    }

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

      const jumpToUrl = proveExtras?.jumpToUrl?.trim();
      const proveInput: ProveInput = {
        clientRequestId: new Date().getTime().toString(),
        userAddress: connectedUserAddress,
        identityPropertyId,
        ...(jumpToUrl !== undefined && jumpToUrl !== ""
          ? { provingParams: { jumpToUrl } }
          : {})
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
      setLastProveSuccess(proveResult);
    } catch (error) {
      setLastProveSuccess(null);
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

  /** Shared path: refresh provider list if needed, `init`, validate identity is enabled, then `prove`. */
  async function runGatewayInitAndProve(
    selectedOption: ProviderOption,
    connectedUserAddress: string,
    proveExtras?: { jumpToUrl?: string },
    options?: { openProgressImmediately?: boolean }
  ): Promise<void> {
    if (options?.openProgressImmediately) {
      openProgressModalAtInitializing();
    }

    const closeProgressModalIfNeeded = () => {
      if (!options?.openProgressImmediately) {
        return;
      }
      setRunning(false);
      setProofModalOpen(false);
      setProgressStatusTrail([]);
    };

    const client = clientRef.current;
    if (!client) {
      closeProgressModalIfNeeded();
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

    const initResult = await initClientWithRetry(client);
    if (!initResult.success) {
      closeProgressModalIfNeeded();
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
      closeProgressModalIfNeeded();
      setAlertModal({
        title: "Identity not available",
        description:
          "This proof type is not enabled for the current Gateway configuration. Pick another option after SDK init succeeds."
      });
      return;
    }

    await runProveFlow(selectedOption, connectedUserAddress, proveExtras, {
      progressModalPrimed: options?.openProgressImmediately === true
    });
  }

  const handleDecodeViaRegistry = useCallback(async () => {
    const res = lastProveSuccess;
    if (!res) {
      return;
    }
    const registry = getBnbTestnetIdentityRegistryAddress();
    const providerHex = normalizeProveProviderIdToBytes32(res.providerId);
    const identityHex = identityPropertyIdToChainBytes32(res.identityPropertyId);
    if (providerHex === undefined || identityHex === undefined) {
      return;
    }
    setDecodeRegistryLoading(true);
    setDecodeError(null);
    setDecodeOutput(null);
    try {
      const wallet = getAddress(res.walletAddress as `0x${string}`);
      const { timestamp, dataBlob } = await fetchLatestIdentityPropertyFromRegistry({
        attestation: { chainId: bscTestnet.id, registry },
        wallet,
        providerId: providerHex,
        identityProperty: identityHex
      });
      const blobDecoded = decodeDataBlobByIdentityProperty(identityHex, dataBlob);
      setDecodeOutput(
        jsonWithBigInt({
          via: "getLatestIdentityProperty",
          registry,
          chainId: bscTestnet.id,
          registryRead: {
            timestamp: timestamp.toString(),
            dataBlob
          },
          dataBlobDecoded: blobDecoded
        })
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDecodeError(msg);
    } finally {
      setDecodeRegistryLoading(false);
    }
  }, [lastProveSuccess]);

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

    if (isAmazonProviderOption(selectedOption)) {
      if (!isPrimusExtensionPresent()) {
        setAlertModal(primusExtensionRequiredModal());
        return;
      }
      setAmazonMarketId("");
      setAmazonRegionMenuOpen(false);
      setAmazonRegionModal({ selectedOption, connectedUserAddress });
      return;
    }

    await runGatewayInitAndProve(selectedOption, connectedUserAddress);
  };

  const handleAmazonMarketSelect = (marketId: string, jumpToUrl: string) => {
    setAmazonMarketId(marketId);
    setAmazonRegionMenuOpen(false);
    setAmazonRegionMenuPosition(null);
    if (!amazonRegionModal) {
      return;
    }
    const pending = amazonRegionModal;
    setAmazonRegionModal(null);
    void runGatewayInitAndProve(
      pending.selectedOption,
      pending.connectedUserAddress,
      {
        jumpToUrl
      },
      { openProgressImmediately: true }
    );
  };

  return (
    <>
      <main className="app-main">
        <div className="panel">
          <header className="panel-header">
            <div>
              <h1>ZKID SDK Integration Live Demo</h1>
              <p>
                A step-by-step walkthrough of integrating zkTLS and zkVM workflow into the
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
            lastProveSuccess={lastProveSuccess}
            decodeRegistryLoading={decodeRegistryLoading}
            canDecodeViaRegistry={canDecodeViaRegistry}
            decodeError={decodeError}
            decodeOutput={decodeOutput}
            onDecodeViaRegistry={() => void handleDecodeViaRegistry()}
          />
        </div>
      </main>

      {proofModalOpen ? (
        <div
          className="modal-backdrop modal-backdrop--progress"
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
              if (alertModal.storeLink && alertModal.description.trim()) {
                parts.push("demo-alert-store-link");
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
                {alertModal.storeLink ? (
                  <>
                    {" "}
                    <a
                      id="demo-alert-store-link"
                      className="modal-dialog__text-link"
                      href={alertModal.storeLink.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        setExtensionInstallPending();
                      }}
                    >
                      {alertModal.storeLink.label}
                    </a>
                  </>
                ) : null}
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
                  onClick={() => {
                    setExtensionInstallPending();
                  }}
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

      {amazonRegionModal ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeAmazonRegionModal();
            }
          }}
        >
          <div
            className="modal-dialog modal-dialog--amazon-region"
            role="dialog"
            aria-modal="true"
            aria-labelledby="amazon-region-title"
            aria-describedby="amazon-region-desc"
          >
            <div className="amazon-region-modal">
              <div className="modal-dialog__header modal-dialog__header--stack">
                <div className="amazon-region-modal__header-row">
                  <div className="modal-dialog__head-text amazon-region-modal__head-text">
                    <h3 id="amazon-region-title" className="modal-dialog__title">
                      Choose Your Amazon Site
                    </h3>
                    <p id="amazon-region-desc" className="modal-dialog__subtitle amazon-region-modal__subtitle">
                      As Amazon has different regional sites, please select the one you use.
                    </p>
                  </div>
                </div>
              </div>
              <div className="amazon-region-field">
                <button
                  ref={amazonSelectTriggerRef}
                  id="amazon-market-select"
                  type="button"
                  className={`amazon-region-select-trigger${amazonMarketId === "" ? " amazon-region-select-trigger--placeholder" : ""}`}
                  aria-haspopup="listbox"
                  aria-expanded={amazonRegionMenuOpen}
                  aria-controls="amazon-market-options"
                  onClick={() => setAmazonRegionMenuOpen((prev) => !prev)}
                >
                  <span className="amazon-region-select-trigger__text">
                    {amazonMarketId === ""
                      ? "Choose a site."
                      : (AMAZON_MARKETPLACES.find((m) => m.id === amazonMarketId)?.label ?? "Choose a site.")}
                  </span>
                  <span className="amazon-region-select-trigger__icon" aria-hidden>
                    ▾
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {amazonRegionModal && amazonRegionMenuOpen && amazonRegionMenuPosition
        ? createPortal(
            <div
              ref={amazonSelectMenuRef}
              className="amazon-region-options amazon-region-options--floating"
              role="listbox"
              id="amazon-market-options"
              style={{
                top: `${amazonRegionMenuPosition.top}px`,
                left: `${amazonRegionMenuPosition.left}px`,
                width: `${amazonRegionMenuPosition.width}px`
              }}
            >
              {AMAZON_MARKETPLACES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="option"
                  aria-selected={amazonMarketId === m.id}
                  className={`amazon-region-option${amazonMarketId === m.id ? " is-selected" : ""}`}
                  onClick={() => handleAmazonMarketSelect(m.id, m.jumpToUrl)}
                >
                  {m.label}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
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

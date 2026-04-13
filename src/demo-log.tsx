import type { ProveSuccessResult } from "@primuslabs/bnb-zkid-sdk";
import type { LogEntry } from "./sdk-demo-types";

type DemoLogProps = {
  entries: LogEntry[];
  lastProveSuccess: ProveSuccessResult | null;
  decodeRegistryLoading: boolean;
  canDecodeViaRegistry: boolean;
  decodeError: string | null;
  decodeOutput: string | null;
  onDecodeViaRegistry: () => void;
};

export function DemoLog({
  entries,
  lastProveSuccess,
  decodeRegistryLoading,
  canDecodeViaRegistry,
  decodeError,
  decodeOutput,
  onDecodeViaRegistry
}: DemoLogProps) {
  return (
    <div className="log" aria-live="polite">
      {entries
        .filter((entry) => entry.kind === "text")
        .map((entry, i) => {
          const isError = entry.text.startsWith("error:");
          const isResult = entry.text.startsWith("prove:");
          if (isResult) {
            return (
              <div key={i} className="log-result-wrap">
                <h4 className="log-result__title">Result</h4>
                <div className="log-line log-line--result">{entry.text}</div>
                <div className="log-decode">
                  <div className="log-decode__btns">
                    <button
                      type="button"
                      className="btn-secondary log-decode__btn"
                      disabled={!canDecodeViaRegistry || decodeRegistryLoading}
                      onClick={onDecodeViaRegistry}
                    >
                      {decodeRegistryLoading ? "Reading…" : "Decode"}
                    </button>
                  </div>
                  {lastProveSuccess && !canDecodeViaRegistry ? (
                    <p className="log-decode__hint">
                      Needs a successful prove result with wallet, provider id, and identity property id (slug or
                      32-byte 0x hex).
                    </p>
                  ) : null}
                  {decodeError ? (
                    <div className="log-decode__error" role="alert">
                      {decodeError}
                    </div>
                  ) : null}
                  {decodeOutput ? (
                    <pre className="log-line log-line--result log-decode__output">{decodeOutput}</pre>
                  ) : null}
                </div>
              </div>
            );
          }
          return (
            <div
              key={i}
              className={`log-line ${isError ? "log-line--error" : ""}`}
            >
              {entry.text}
            </div>
          );
        })}
    </div>
  );
}

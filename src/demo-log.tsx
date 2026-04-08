import type { LogEntry } from "./sdk-demo-types";

type DemoLogProps = {
  entries: LogEntry[];
  running: boolean;
  progressStatus: string | null;
  runOutcome: "success" | "failed" | null;
};

const PROGRESS_STEPS = [
  { key: "initializing", label: "Initializing" },
  { key: "data_verifying", label: "Data Verifying" },
  { key: "proof_generating", label: "Proof Generating" },
  { key: "on_chain_attested", label: "On-chain Attested" }
] as const;

export function DemoLog({ entries, running, progressStatus, runOutcome }: DemoLogProps) {
  const activeStepIndex = PROGRESS_STEPS.findIndex((step) => step.key === progressStatus);

  return (
    <div className="log" aria-live="polite">
      <div className="progress-steps" role="status" aria-label="Proof generation progress">
        {PROGRESS_STEPS.map((step, index) => {
          const isDone = activeStepIndex > index;
          const isActive = activeStepIndex === index;
          return (
            <div
              key={step.key}
              className={`progress-step ${isDone ? "is-done" : ""} ${isActive ? "is-active" : ""}`}
            >
              <span className="progress-step-dot" aria-hidden />
              <span>{step.label}</span>
            </div>
          );
        })}
        {!running && runOutcome ? (
          <div className={`progress-final progress-final--${runOutcome}`}>
            {runOutcome === "success" ? "Final Status: Success" : "Final Status: Failed"}
          </div>
        ) : null}
        {!running && activeStepIndex < 0 && !runOutcome ? (
          <div className="progress-idle">Start by selecting a provider</div>
        ) : null}
      </div>

      {entries
        .filter((entry) => entry.kind === "text")
        .map((entry, i) => {
          const isError = entry.text.startsWith("error:");
          const isResult = entry.text.startsWith("prove:");
          return (
            <div
              key={i}
              className={`log-line ${isError ? "log-line--error" : ""} ${isResult ? "log-line--result" : ""}`}
            >
              {entry.text}
            </div>
          );
        })}
    </div>
  );
}

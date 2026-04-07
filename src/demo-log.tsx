import type { LogEntry } from "./sdk-demo-types";

type DemoLogProps = {
  entries: LogEntry[];
};

export function DemoLog({ entries }: DemoLogProps) {
  return (
    <div className="log" aria-live="polite">
      {entries.map((entry, i) => {
        if (entry.kind === "text") {
          return (
            <div key={i} className="log-line">
              {entry.text}
            </div>
          );
        }

        return (
          <div
            key={i}
            className={`log-outcome log-outcome--${entry.success ? "success" : "failure"}`}
          >
            <span
              className={`status-dot status-dot--${entry.success ? "success" : "failure"}`}
              aria-hidden
            />
            <span>
              {entry.success
                ? "Success: prove flow completed"
                : "Failure: prove flow did not complete successfully"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

import type { LogEntry } from "./sdk-demo-types";

type DemoLogProps = {
  entries: LogEntry[];
};

export function DemoLog({ entries }: DemoLogProps) {
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

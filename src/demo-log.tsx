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

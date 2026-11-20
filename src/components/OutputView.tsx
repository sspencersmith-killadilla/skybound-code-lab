import { useEffect, useRef } from "react";
import type { OutLine } from "@/lib/python-runtime";

export function OutputView({ lines }: { lines: OutLine[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect((): void => {
    // Never return a DOM call: extensions can change its return value, which
    // React would then try to invoke as an effect cleanup on the next update.
    end.current?.scrollIntoView();
  }, [lines]);
  if (!lines.length) return <p className="text-sm text-muted-foreground">Press Run to see output here.</p>;
  return (
    <div className="font-mono text-xs leading-relaxed">
      {lines.map((l, i) =>
        l.kind === "image" ? (
          <img key={i} src={`data:image/png;base64,${l.text}`} alt="Plot" className="my-2 w-full rounded bg-foreground" />
        ) : (
          <pre
            key={i}
            className={`whitespace-pre-wrap ${l.kind === "stderr" ? "text-destructive" : l.kind === "info" ? "text-muted-foreground" : l.kind === "result" ? "text-success" : ""}`}
          >
            {l.text}
          </pre>
        ),
      )}
      <div ref={end} />
    </div>
  );
}
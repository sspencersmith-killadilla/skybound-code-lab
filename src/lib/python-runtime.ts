// Main-thread wrapper around the Pyodide worker.
export type OutLine = { kind: "stdout" | "stderr" | "info" | "result" | "image"; text: string };
export type PyFile = { path: string; content: string };

type Listener = (l: OutLine) => void;

export class PythonRuntime {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private listeners = new Set<Listener>();
  ready = false;
  onReady?: () => void;

  start() {
    this.worker = new Worker(new URL("./py-worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "stdout" || m.type === "stderr") this.emit({ kind: m.type, text: m.text });
      else if (m.type === "ready") {
        this.ready = true;
        this.onReady?.();
      } else if (m.type === "done") {
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (!p) return;
        if (m.error) p.reject(new Error(m.error));
        else p.resolve(m.data);
      }
    };
    this.send("init", {}).catch(() => {});
  }

  stop() {
    this.worker?.terminate();
    for (const p of this.pending.values()) p.reject(new Error("Stopped"));
    this.pending.clear();
    this.ready = false;
  }

  restart() {
    this.stop();
    this.start();
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  emit(l: OutLine) {
    this.listeners.forEach((fn) => fn(l));
  }

  send<T = any>(type: string, payload: Record<string, unknown>): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ id, type, ...payload });
    });
  }
}

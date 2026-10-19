import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { toast } from "sonner";
import { ArrowLeft, Play, Square, FilePlus, Trash2, Pencil, FlaskConical, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PythonRuntime, type OutLine } from "@/lib/python-runtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/projects/$id")({
  head: () => ({
    meta: [
      { title: "Workspace — PyBench" },
      { name: "description", content: "Edit and run your Python project." },
      { property: "og:title", content: "Workspace — PyBench" },
      { property: "og:description", content: "Edit and run your Python project." },
    ],
  }),
  component: Workspace,
});

type FileRow = { id: string; path: string; content: string };
type Fn = { name: string; params: { name: string; default: string | null; annotation: string | null }[]; doc: string | null };
type TestResult = { id: string; outcome: string; detail: string };

function Workspace() {
  const { id } = Route.useParams();
  const [name, setName] = useState("");
  const [packages, setPackages] = useState<string[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [output, setOutput] = useState<OutLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("output");
  const rt = useRef<PythonRuntime | null>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // load project
  useEffect(() => {
    (async () => {
      const { data: p } = await supabase.from("projects").select("*").eq("id", id).single();
      if (p) {
        setName(p.name);
        setPackages(p.packages ?? []);
      }
      const { data: f } = await supabase.from("project_files").select("id,path,content").eq("project_id", id).order("path");
      setFiles(f ?? []);
      setActive((f ?? []).find((x) => x.path === "main.py")?.path ?? f?.[0]?.path ?? null);
    })();
  }, [id]);

  // runtime
  useEffect(() => {
    const r = new PythonRuntime();
    r.onReady = () => setReady(true);
    r.start();
    rt.current = r;
    const unsub = r.subscribe((l) => setOutput((o) => [...o, l]));
    return () => {
      unsub();
      r.stop();
    };
  }, []);

  const activeFile = files.find((f) => f.path === active);

  const updateContent = (content: string) => {
    if (!activeFile) return;
    setFiles((fs) => fs.map((f) => (f.id === activeFile.id ? { ...f, content } : f)));
    clearTimeout(saveTimers.current[activeFile.id]);
    const fid = activeFile.id;
    saveTimers.current[fid] = setTimeout(async () => {
      await supabase.from("project_files").update({ content, updated_at: new Date().toISOString() }).eq("id", fid);
      await supabase.from("projects").update({ updated_at: new Date().toISOString() }).eq("id", id);
    }, 700);
  };

  const payload = () => ({ files: files.map(({ path, content }) => ({ path, content })), packages });

  function pushImages(images?: string[]) {
    images?.forEach((b64) => setOutput((o) => [...o, { kind: "image", text: b64 }]));
  }

  async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (!rt.current) return undefined;
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      setOutput((o) => [...o, { kind: "stderr", text: (e as Error).message + "\n" }]);
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!active) return;
    setTab("output");
    setOutput([{ kind: "info", text: `▶ python ${active}\n` }]);
    await guard(async () => {
      const r = await rt.current!.send<{ ok: boolean; images: string[] }>("run", { ...payload(), path: active });
      pushImages(r.images);
      setOutput((o) => [...o, { kind: "info", text: r.ok ? "✓ finished\n" : "✗ exited with error\n" }]);
    });
  }

  function stop() {
    rt.current?.restart();
    setReady(false);
    setBusy(false);
    setOutput((o) => [...o, { kind: "info", text: "■ stopped — Python restarted\n" }]);
  }

  async function addFile() {
    const path = prompt("File name", "utils.py")?.trim();
    if (!path) return;
    if (files.some((f) => f.path === path)) { toast.error("File already exists"); return; }
    const { data, error } = await supabase.from("project_files").insert({ project_id: id, path, content: "" }).select("id,path,content").single();
    if (error) { toast.error(error.message); return; }
    setFiles((fs) => [...fs, data].sort((a, b) => a.path.localeCompare(b.path)));
    setActive(path);
  }

  async function renameFile(f: FileRow) {
    const path = prompt("Rename to", f.path)?.trim();
    if (!path || path === f.path) return;
    const { error } = await supabase.from("project_files").update({ path }).eq("id", f.id);
    if (error) { toast.error(error.message); return; }
    setFiles((fs) => fs.map((x) => (x.id === f.id ? { ...x, path } : x)));
    if (active === f.path) setActive(path);
  }

  async function deleteFile(f: FileRow) {
    if (!confirm(`Delete ${f.path}?`)) return;
    await supabase.from("project_files").delete().eq("id", f.id);
    const rest = files.filter((x) => x.id !== f.id);
    setFiles(rest);
    if (active === f.path) setActive(rest[0]?.path ?? null);
  }

  async function renameProject(n: string) {
    setName(n);
    await supabase.from("projects").update({ name: n || "Untitled project" }).eq("id", id);
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center gap-3 border-b px-4 py-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back to projects">
          <Link to="/projects">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <input
          value={name}
          onChange={(e) => renameProject(e.target.value)}
          className="w-64 bg-transparent font-semibold outline-none focus:text-primary"
          aria-label="Project name"
        />
        <span className="ml-2 font-mono text-xs text-muted-foreground">{ready ? "● python ready" : "○ loading python…"}</span>
        <div className="ml-auto flex gap-2">
          {busy && (
            <Button variant="outline" size="sm" onClick={stop}>
              <Square className="mr-2 h-3 w-3" /> Stop
            </Button>
          )}
          <Button size="sm" onClick={run} disabled={busy || !active}>
            <Play className="mr-2 h-3 w-3" /> Run {active}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-52 shrink-0 border-r bg-panel">
          <div className="flex items-center justify-between px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground">
            Files
            <button onClick={addFile} aria-label="New file" className="hover:text-primary">
              <FilePlus className="h-4 w-4" />
            </button>
          </div>
          {files.map((f) => (
            <div
              key={f.id}
              className={`group flex items-center px-3 py-1.5 font-mono text-sm ${f.path === active ? "bg-accent text-primary" : "hover:bg-accent/50"}`}
            >
              <button className="flex-1 truncate text-left" onClick={() => setActive(f.path)}>
                {f.path}
              </button>
              <button className="hidden group-hover:block" onClick={() => renameFile(f)} aria-label="Rename">
                <Pencil className="h-3 w-3" />
              </button>
              <button className="ml-1 hidden group-hover:block" onClick={() => deleteFile(f)} aria-label="Delete">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </aside>

        <main className="min-w-0 flex-1 overflow-auto">
          {activeFile ? (
            <CodeMirror
              key={activeFile.id}
              value={activeFile.content}
              height="100%"
              theme={oneDark}
              extensions={[python()]}
              onChange={updateContent}
              className="h-full text-sm"
            />
          ) : (
            <div className="p-8 text-muted-foreground">Create a file to get started.</div>
          )}
        </main>

        <section className="flex w-[420px] shrink-0 flex-col border-l bg-panel">
          <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
            <TabsList className="m-2 grid grid-cols-5">
              <TabsTrigger value="output">Output</TabsTrigger>
              <TabsTrigger value="console">Console</TabsTrigger>
              <TabsTrigger value="functions">Funcs</TabsTrigger>
              <TabsTrigger value="tests">Tests</TabsTrigger>
              <TabsTrigger value="packages">Pkgs</TabsTrigger>
            </TabsList>
            <TabsContent value="output" className="min-h-0 flex-1 overflow-auto px-3 pb-3">
              <OutputView lines={output} />
            </TabsContent>
            <TabsContent value="console" className="flex min-h-0 flex-1 flex-col px-3 pb-3">
              <ConsoleView rt={rt} lines={output} setOutput={setOutput} busy={busy} setBusy={setBusy} />
            </TabsContent>
            <TabsContent value="functions" className="min-h-0 flex-1 overflow-auto px-3 pb-3">
              <FunctionsView rt={rt} path={active} payload={payload} busy={busy} guard={guard} />
            </TabsContent>
            <TabsContent value="tests" className="min-h-0 flex-1 overflow-auto px-3 pb-3">
              <TestsView rt={rt} payload={payload} busy={busy} guard={guard} />
            </TabsContent>
            <TabsContent value="packages" className="min-h-0 flex-1 overflow-auto px-3 pb-3">
              <PackagesView projectId={id} packages={packages} setPackages={setPackages} rt={rt} guard={guard} />
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </div>
  );
}

function OutputView({ lines }: { lines: OutLine[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView(), [lines]);
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

function ConsoleView({
  rt,
  lines,
  setOutput,
  busy,
  setBusy,
}: {
  rt: React.MutableRefObject<PythonRuntime | null>;
  lines: OutLine[];
  setOutput: React.Dispatch<React.SetStateAction<OutLine[]>>;
  busy: boolean;
  setBusy: (b: boolean) => void;
}) {
  const [expr, setExpr] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!expr.trim() || !rt.current) return;
    const code = expr;
    setExpr("");
    setOutput((o) => [...o, { kind: "info", text: `>>> ${code}\n` }]);
    setBusy(true);
    try {
      const r = await rt.current.send<{ result: string | null; images: string[] }>("eval", { expr: code });
      if (r.result != null) setOutput((o) => [...o, { kind: "result", text: r.result + "\n" }]);
      r.images?.forEach((b) => setOutput((o) => [...o, { kind: "image", text: b }]));
    } catch (err) {
      setOutput((o) => [...o, { kind: "stderr", text: (err as Error).message + "\n" }]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="mb-2 text-xs text-muted-foreground">Uses everything defined by your last Run. Try calling a function.</p>
      <div className="min-h-0 flex-1 overflow-auto rounded border bg-background p-2">
        <OutputView lines={lines} />
      </div>
      <form onSubmit={submit} className="mt-2 flex gap-2">
        <Input value={expr} onChange={(e) => setExpr(e.target.value)} placeholder=">>> area(3)" className="font-mono" disabled={busy} />
        <Button type="submit" disabled={busy}>
          Run
        </Button>
      </form>
    </>
  );
}

type Guard = <T>(fn: () => Promise<T>) => Promise<T | undefined>;
type Payload = () => { files: { path: string; content: string }[]; packages: string[] };

function FunctionsView({
  rt,
  path,
  payload,
  busy,
  guard,
}: {
  rt: React.MutableRefObject<PythonRuntime | null>;
  path: string | null;
  payload: Payload;
  busy: boolean;
  guard: Guard;
}) {
  const [fns, setFns] = useState<Fn[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [args, setArgs] = useState<Record<string, string[]>>({});
  const [results, setResults] = useState<Record<string, { ok: boolean; text: string }>>({});

  const refresh = useCallback(async () => {
    if (!path || !rt.current) return;
    try {
      const r = await rt.current.send<{ functions: Fn[]; error?: string }>("introspect", { ...payload(), path });
      setFns(r.functions);
      setErr(r.error ?? null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [path, rt, payload]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  async function call(fn: Fn) {
    const a = fn.params.map((p, i) => args[fn.name]?.[i] ?? p.default ?? "");
    const errs: string[] = [];
    const unsub = rt.current!.subscribe((l) => l.kind === "stderr" && errs.push(l.text));
    await guard(async () => {
      const r = await rt.current!.send<{ ok: boolean; result?: string }>("call", { ...payload(), path, name: fn.name, args: a });
      setResults((s) => ({ ...s, [fn.name]: { ok: r.ok, text: r.ok ? (r.result ?? "") : (errs.join("").trim().split("\n").slice(-1)[0] ?? "Error") } }));
    });
    unsub();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Functions in {path}</span>
        <Button variant="ghost" size="sm" onClick={refresh} aria-label="Refresh functions">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
      {err && <p className="font-mono text-xs text-destructive">{err}</p>}
      {fns.length === 0 && !err && <p className="text-sm text-muted-foreground">No functions found. Define one with def.</p>}
      {fns.map((fn) => (
        <div key={fn.name} className="rounded border bg-background p-3">
          <div className="font-mono text-sm font-semibold text-primary">{fn.name}()</div>
          {fn.doc && <p className="mt-1 text-xs text-muted-foreground">{fn.doc}</p>}
          <div className="mt-2 space-y-2">
            {fn.params.map((p, i) => (
              <label key={p.name} className="flex items-center gap-2 font-mono text-xs">
                <span className="w-24 truncate">
                  {p.name}
                  {p.annotation && <span className="text-muted-foreground">: {p.annotation}</span>}
                </span>
                <Input
                  className="h-7 font-mono text-xs"
                  placeholder={p.default ?? "value"}
                  value={args[fn.name]?.[i] ?? ""}
                  onChange={(e) =>
                    setArgs((s) => {
                      const arr = [...(s[fn.name] ?? [])];
                      arr[i] = e.target.value;
                      return { ...s, [fn.name]: arr };
                    })
                  }
                />
              </label>
            ))}
          </div>
          <Button size="sm" className="mt-3" disabled={busy} onClick={() => call(fn)}>
            <Play className="mr-1 h-3 w-3" /> Call
          </Button>
          {results[fn.name] && (
            <pre className={`mt-2 whitespace-pre-wrap font-mono text-xs ${results[fn.name]!.ok ? "text-success" : "text-destructive"}`}>
              {results[fn.name]!.ok ? "→ " : ""}
              {results[fn.name]!.text}
            </pre>
          )}
        </div>
      ))}
      <p className="text-xs text-muted-foreground">Inputs are Python values: 3, "text", [1, 2], {"{"}"a": 1{"}"}</p>
    </div>
  );
}

function TestsView({ rt, payload, busy, guard }: { rt: React.MutableRefObject<PythonRuntime | null>; payload: Payload; busy: boolean; guard: Guard }) {
  const [results, setResults] = useState<TestResult[] | null>(null);
  const summary = useMemo(() => {
    if (!results) return null;
    const passed = results.filter((r) => r.outcome === "passed").length;
    return { passed, failed: results.length - passed };
  }, [results]);
  async function runTests() {
    await guard(async () => {
      const r = await rt.current!.send<{ results: TestResult[] }>("test", payload());
      setResults(r.results);
    });
  }
  return (
    <div className="space-y-3">
      <Button size="sm" onClick={runTests} disabled={busy}>
        <FlaskConical className="mr-2 h-3 w-3" /> Run tests
      </Button>
      <p className="text-xs text-muted-foreground">Runs pytest on files named test_*.py</p>
      {summary && (
        <div className="font-mono text-sm">
          <span className="text-success">{summary.passed} passed</span>
          {summary.failed > 0 && <span className="ml-3 text-destructive">{summary.failed} failed</span>}
        </div>
      )}
      {results?.length === 0 && <p className="text-sm text-muted-foreground">No tests found.</p>}
      {results?.map((r) => (
        <div key={r.id} className="rounded border bg-background p-2">
          <div className={`font-mono text-xs ${r.outcome === "passed" ? "text-success" : "text-destructive"}`}>
            {r.outcome === "passed" ? "✓" : "✗"} {r.id}
          </div>
          {r.detail && <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">{r.detail}</pre>}
        </div>
      ))}
    </div>
  );
}

function PackagesView({
  projectId,
  packages,
  setPackages,
  rt,
  guard,
}: {
  projectId: string;
  packages: string[];
  setPackages: (p: string[]) => void;
  rt: React.MutableRefObject<PythonRuntime | null>;
  guard: Guard;
}) {
  const [name, setName] = useState("");
  async function save(next: string[]) {
    setPackages(next);
    await supabase.from("projects").update({ packages: next }).eq("id", projectId);
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || packages.includes(n)) return;
    const ok = await guard(async () => {
      await rt.current!.send("install", { packages: [n] });
      return true;
    });
    if (ok) {
      await save([...packages, n]);
      toast.success(`Installed ${n}`);
      setName("");
    } else toast.error(`Couldn't install ${n}`);
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        numpy, pandas, matplotlib, scipy and more load automatically when imported. Add any other pure-Python package here.
      </p>
      <form onSubmit={add} className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. requests" className="font-mono" />
        <Button type="submit">Install</Button>
      </form>
      {packages.map((p) => (
        <div key={p} className="flex items-center justify-between rounded border bg-background px-3 py-1.5 font-mono text-sm">
          {p}
          <button onClick={() => save(packages.filter((x) => x !== p))} aria-label={`Remove ${p}`}>
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

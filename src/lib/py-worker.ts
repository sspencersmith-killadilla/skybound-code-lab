/// <reference lib="webworker" />
// Runs Python via Pyodide off the main thread.
const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/";

const HELPER = `
import sys, os, io, json, ast, base64, traceback, importlib
PROJ = "/home/pyodide/project"
os.makedirs(PROJ, exist_ok=True)
os.environ["MPLBACKEND"] = "AGG"
_ns = {}

def _write_files(files_json):
    import shutil
    files = json.loads(files_json)
    if os.path.exists(PROJ):
        shutil.rmtree(PROJ)
    os.makedirs(PROJ, exist_ok=True)
    for f in files:
        p = os.path.join(PROJ, f["path"])
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w") as fh:
            fh.write(f["content"])
    os.chdir(PROJ)
    if PROJ not in sys.path:
        sys.path.insert(0, PROJ)
    for f in files:
        mod = f["path"][:-3].replace("/", ".") if f["path"].endswith(".py") else None
        if mod and mod in sys.modules:
            del sys.modules[mod]
    importlib.invalidate_caches()

def _flush_figs():
    out = []
    if "matplotlib.pyplot" in sys.modules:
        plt = sys.modules["matplotlib.pyplot"]
        for n in plt.get_fignums():
            buf = io.BytesIO()
            plt.figure(n).savefig(buf, format="png", bbox_inches="tight", dpi=110)
            out.append(base64.b64encode(buf.getvalue()).decode())
        plt.close("all")
    return out

def _run(path):
    global _ns
    _ns = {"__name__": "__main__", "__file__": os.path.join(PROJ, path)}
    src = open(os.path.join(PROJ, path)).read()
    try:
        exec(compile(src, path, "exec"), _ns)
        ok = True
    except BaseException:
        traceback.print_exc()
        ok = False
    return json.dumps({"ok": ok, "images": _flush_figs()})

def _eval(expr):
    try:
        try:
            code = compile(expr, "<console>", "eval")
            r = eval(code, _ns)
            res = None if r is None else repr(r)
        except SyntaxError:
            exec(compile(expr, "<console>", "exec"), _ns)
            res = None
        return json.dumps({"ok": True, "result": res, "images": _flush_figs()})
    except BaseException:
        traceback.print_exc()
        return json.dumps({"ok": False, "images": _flush_figs()})

def _introspect(path):
    try:
        tree = ast.parse(open(os.path.join(PROJ, path)).read())
    except SyntaxError as e:
        return json.dumps({"error": str(e), "functions": []})
    fns = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and not node.name.startswith("_"):
            a = node.args
            defaults = [None] * (len(a.args) - len(a.defaults)) + [ast.unparse(d) for d in a.defaults]
            params = [{"name": x.arg, "default": d, "annotation": ast.unparse(x.annotation) if x.annotation else None} for x, d in zip(a.args, defaults)]
            fns.append({"name": node.name, "params": params, "doc": ast.get_docstring(node)})
    return json.dumps({"functions": fns})

def _call(path, name, args_json):
    global _ns
    args = json.loads(args_json)
    import contextlib
    quiet = io.StringIO()
    _ns = {"__name__": "__playground__", "__file__": os.path.join(PROJ, path)}
    try:
        with contextlib.redirect_stdout(quiet):
            exec(compile(open(os.path.join(PROJ, path)).read(), path, "exec"), _ns)
        call_args = [eval(v, _ns) for v in args if v.strip() != ""]
        r = _ns[name](*call_args)
        return json.dumps({"ok": True, "result": repr(r), "images": _flush_figs()})
    except BaseException:
        traceback.print_exc()
        return json.dumps({"ok": False, "images": _flush_figs()})

def _test():
    import pytest
    results = []
    class C:
        def pytest_runtest_logreport(self, report):
            if report.when == "call" or (report.when == "setup" and report.outcome != "passed"):
                results.append({"id": report.nodeid, "outcome": report.outcome, "detail": str(report.longrepr) if report.failed else ""})
    for m in list(sys.modules):
        if m.startswith("test_"):
            del sys.modules[m]
    pytest.main(["-q", "-p", "no:cacheprovider", "--rootdir", PROJ, PROJ], plugins=[C()])
    return json.dumps({"results": results})
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Msg = any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pyodide: any = null;
let ready: Promise<void> | null = null;

function post(m: unknown) {
  (self as unknown as Worker).postMessage(m);
}

async function init() {
  const mod = await import(/* @vite-ignore */ PYODIDE_URL + "pyodide.mjs");
  pyodide = await mod.loadPyodide({ indexURL: PYODIDE_URL });
  pyodide.setStdout({ batched: (s: string) => post({ type: "stdout", text: s + "\n" }) });
  pyodide.setStderr({ batched: (s: string) => post({ type: "stderr", text: s + "\n" }) });
  await pyodide.loadPackage("micropip");
  await pyodide.runPythonAsync(HELPER);
  post({ type: "ready" });
}

async function prepare(files: { path: string; content: string }[], packages: string[]) {
  pyodide.globals.get("_write_files")(JSON.stringify(files));
  const all = files.map((f) => f.content).join("\n");
  await pyodide.loadPackagesFromImports(all, { messageCallback: () => {} });
  if (packages.length) {
    const micropip = pyodide.pyimport("micropip");
    await micropip.install(packages);
  }
}

self.onmessage = async (e: MessageEvent<Msg>) => {
  const m = e.data;
  try {
    if (!ready) ready = init();
    await ready;
    const files = (m.files as { path: string; content: string }[]) ?? [];
    const packages = (m.packages as string[]) ?? [];
    let out: string;
    switch (m.type) {
      case "init":
        post({ type: "done", id: m.id, data: {} });
        return;
      case "run":
        await prepare(files, packages);
        out = pyodide.globals.get("_run")(m.path);
        break;
      case "eval":
        out = pyodide.globals.get("_eval")(m.expr);
        break;
      case "introspect":
        pyodide.globals.get("_write_files")(JSON.stringify(files));
        out = pyodide.globals.get("_introspect")(m.path);
        break;
      case "call":
        await prepare(files, packages);
        out = pyodide.globals.get("_call")(m.path, m.name, JSON.stringify(m.args));
        break;
      case "test": {
        await prepare(files, packages);
        await pyodide.pyimport("micropip").install("pytest");
        out = pyodide.globals.get("_test")();
        break;
      }
      case "install": {
        await pyodide.pyimport("micropip").install(m.packages as string[]);
        out = JSON.stringify({ ok: true });
        break;
      }
      default:
        throw new Error("unknown message");
    }
    post({ type: "done", id: m.id, data: JSON.parse(out) });
  } catch (err) {
    post({ type: "done", id: m.id, error: String((err as Error)?.message ?? err) });
  }
};

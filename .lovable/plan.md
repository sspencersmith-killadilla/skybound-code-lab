# Cloud Python Playground

A web app where you sign in, write Python across multiple files, run it, call functions, plot charts, and run tests. Python runs inside the browser, so it's fast, free to run, and safe.

## What you'll get

- **Sign in** with email/password (and Google). Your projects and files are saved to your account.
- **Projects dashboard**: create, rename, delete projects.
- **Editor workspace** (per project):
  - Left: file tree (add/rename/delete `.py` files; files can `import` each other).
  - Center: code editor with Python syntax highlighting, autosave.
  - Right/bottom tabs:
    - **Output**: stdout/stderr from Run, plus matplotlib charts shown inline.
    - **Console**: type expressions like `add(2, 3)` against the last run's state.
    - **Functions**: auto-lists every top-level function in the current file with input boxes per argument and a Run button; shows return value.
    - **Tests**: runs pytest on `test_*.py` files and shows pass/fail per test.
    - **Packages**: install numpy, pandas, matplotlib, etc. List saved per project and auto-loaded.
- Stop button to reset a stuck run.

## Design

Dark, developer-focused look: charcoal background, one warm accent, monospace for code, clean sans for UI. No generic purple gradients.

## Limits to know

- Runs in your browser: no internet requests from scripts, no system access, heavy jobs limited by your computer.
- Most pure-Python and popular science libraries work; some packages with native code may not.

## Technical details

- Lovable Cloud: auth, tables `projects` (owner, name), `project_files` (project_id, path, content), `project_packages`; RLS scoped to owner, grants included.
- Python via Pyodide in a Web Worker (keeps UI responsive, enables Stop by terminating the worker). Files written to Pyodide's virtual FS before each run so imports work.
- Function panel: Python `ast`/`inspect` introspection returns signatures; args parsed as Python literals.
- Matplotlib with Agg backend, figures returned as PNGs.
- Tests: micropip install pytest, run with a result-collecting plugin.
- Editor: CodeMirror 6 (lazy, client-only).
- Routes: `/` landing, `/auth`, `/_authenticated/projects`, `/_authenticated/projects/$id`.

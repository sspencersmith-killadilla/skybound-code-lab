<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Python execution runs client-side in a Pyodide Web Worker (src/lib/py-worker.ts) — no server compute, and Stop works by terminating the worker.
- Project/file CRUD uses the browser Lovable Cloud client with owner-scoped RLS — no server functions needed for this data.

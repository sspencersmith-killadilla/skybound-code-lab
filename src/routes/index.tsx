import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tinker — Run Python in your browser" },
      { name: "description", content: "A cloud Python workspace: run scripts, call functions, plot charts and run tests." },
      { property: "og:title", content: "Tinker — Run Python in your browser" },
      { property: "og:description", content: "Run scripts, call functions, plot charts and run tests — saved to your account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const sample = `def fib(n: int) -> int:
    return n if n < 2 else fib(n-1) + fib(n-2)

print([fib(i) for i in range(10)])`;

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo />
        <Button asChild variant="ghost">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>
      <main className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 md:grid-cols-2">
        <div>
          <h1 className="text-5xl font-bold leading-tight tracking-tight">
            Python, ready <span className="text-primary">whenever you are.</span>
          </h1>
          <p className="mt-6 max-w-md text-lg text-muted-foreground">
            Write scripts, run them, poke at individual functions, draw charts and run your tests — all in the browser, saved to your account.
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link to="/projects">Open workspace</Link>
          </Button>
        </div>
        <div className="overflow-hidden rounded-lg border bg-panel">
          <div className="border-b px-4 py-2 font-mono text-xs text-muted-foreground">main.py</div>
          <pre className="p-4 font-mono text-sm leading-relaxed">{sample}</pre>
          <div className="border-t px-4 py-3 font-mono text-sm text-success">[0, 1, 1, 2, 3, 5, 8, 13, 21, 34]</div>
        </div>
      </main>
    </div>
  );
}

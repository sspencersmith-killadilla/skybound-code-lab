import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "Your projects — PyBench" },
      { name: "description", content: "All your saved Python projects." },
      { property: "og:title", content: "Your projects — PyBench" },
      { property: "og:description", content: "All your saved Python projects." },
    ],
  }),
  component: Projects,
});

const STARTER = `import math

def area(radius: float) -> float:
    """Area of a circle."""
    return math.pi * radius ** 2

def greet(name="world"):
    return f"Hello, {name}!"

print(greet())
print("area(2) =", round(area(2), 3))
`;
const STARTER_TEST = `from main import area, greet

def test_greet():
    assert greet("Ada") == "Hello, Ada!"

def test_area():
    assert round(area(1), 2) == 3.14
`;

function Projects() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("projects").insert({ name: "Untitled project" }).select().single();
      if (error) throw error;
      const { error: e2 } = await supabase.from("project_files").insert([
        { project_id: data.id, path: "main.py", content: STARTER },
        { project_id: data.id, path: "test_main.py", content: STARTER_TEST },
      ]);
      if (e2) throw e2;
      return data;
    },
    onSuccess: (p) => navigate({ to: "/projects/$id", params: { id: p.id } }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <span className="font-mono text-lg font-semibold">
          <span className="text-primary">&gt;_</span> PyBench
        </span>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </Button>
      </div>
      <div className="mt-10 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Projects</h1>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          <Plus className="mr-2 h-4 w-4" /> New project
        </Button>
      </div>
      <div className="mt-6 divide-y rounded-lg border bg-card">
        {isLoading && <div className="p-6 text-muted-foreground">Loading…</div>}
        {!isLoading && projects.length === 0 && (
          <div className="p-10 text-center text-muted-foreground">No projects yet. Create one to start coding.</div>
        )}
        {projects.map((p) => (
          <div key={p.id} className="flex items-center justify-between px-5 py-4 hover:bg-accent/40">
            <Link to="/projects/$id" params={{ id: p.id }} className="flex-1">
              <div className="font-medium">{p.name}</div>
              <div className="font-mono text-xs text-muted-foreground">
                updated {new Date(p.updated_at).toLocaleString()}
              </div>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete project"
              onClick={() => confirm(`Delete "${p.name}"?`) && remove.mutate(p.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

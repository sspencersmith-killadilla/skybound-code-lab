import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createLovableAiGatewayRunIdFetch } from "./run-id";

const INSTRUCTIONS = `You write Python 3.12 code that runs in Pyodide inside a web browser.
Rules:
- Reply with ONLY one complete Python file in a single \`\`\`python code block. No explanation outside it.
- Use print() so results are visible. Put short comments in the code instead of prose.
- Available: the standard library, numpy, pandas, matplotlib, scipy, sympy, scikit-learn. For charts use matplotlib.pyplot; do NOT call plt.show() or savefig — figures are captured automatically.
- No network requests, no input(), no file dialogs, no threads or subprocesses.
- Define reusable logic as top-level functions with type hints and docstrings, then demo them under the code.
- If the user asks to change existing code, return the full updated file.`;

export async function generatePython(args: {
  prompt: string;
  currentCode: string;
  fileName: string;
  otherFiles: string[];
}) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured.");
  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const context = [
    `Current file: ${args.fileName}`,
    args.otherFiles.length ? `Other project files (importable): ${args.otherFiles.join(", ")}` : "",
    args.currentCode.trim() ? `Current contents of ${args.fileName}:\n\`\`\`python\n${args.currentCode}\n\`\`\`` : "The file is empty.",
    `Request: ${args.prompt}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  let streamError: unknown = null;
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    instructions: INSTRUCTIONS,
    messages: [{ role: "user", content: context }],
    onError: ({ error }) => {
      streamError = error;
    },
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });

  const text = await result.text;
  if (streamError) {
    const e = streamError as { statusCode?: number; message?: string };
    if (e.statusCode === 402) throw new Error("AI credits are used up. Add credits in Settings → Plans & credits.");
    if (e.statusCode === 429) throw new Error("Too many AI requests right now. Wait a moment and try again.");
    throw new Error(e.message ?? "AI request failed.");
  }
  const match = text.match(/```(?:python|py)?\s*\n([\s\S]*?)```/);
  const code = (match ? match[1] : text).trim() + "\n";
  if (!code.trim()) throw new Error("The AI didn't return any code. Try rephrasing your request.");
  return { code };
}

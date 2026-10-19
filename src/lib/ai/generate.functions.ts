import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const generateCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        prompt: z.string().min(1).max(4000),
        currentCode: z.string().max(100_000),
        fileName: z.string().max(200),
        otherFiles: z.array(z.string().max(200)).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { generatePython } = await import("./generate.server");
    return generatePython(data);
  });

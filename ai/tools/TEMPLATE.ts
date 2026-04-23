// ai/tools/TEMPLATE.ts
//
// Kopier denne filen til riktig kategori-mappe og fyll inn.
// Husk å registrere i ai/tools/index.ts etterpå.

import { z } from "zod";
import type { Tool } from "./types";

const inputSchema = z.object({
  // Definer input her, f.eks:
  // taskId: z.string().uuid().describe("UUID of the task"),
});

export const myNewTool: Tool<z.infer<typeof inputSchema>> = {
  name: "my_new_tool", // snake_case, unik
  description: "En kort, AI-vennlig beskrivelse av hva verktøyet gjør.",
  category: "task", // eller code/project/review/memory/brain/component/meta

  inputSchema,

  surfaces: ["chat"], // ["chat"], ["agent"], eller ["chat", "agent"]
  costHint: "low", // "low" | "medium" | "high"
  // maxCallsPerSession: 3,
  // requiresActivePlan: false,
  // forbiddenWithActivePlan: false,
  // requiresApproval: false,

  async handler(_input, _ctx) {
    // Implementer her. Eksempel:
    // const result = await someEncoreClient.someEndpoint({ ... });
    // return { success: true, message: "Done", data: result };

    return {
      success: true,
      message: "TODO: implement handler",
    };
  },
};

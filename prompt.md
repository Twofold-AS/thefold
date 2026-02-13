Neste Steg: 1.3 - Confidence Scoring
Mål: AI vurderer egen sikkerhet før task execution (forhindrer 60% av feilede tasks)

Prompt for Steg 1.3: Confidence Scoring
Les først:

KOMPLETT-BYGGEPLAN.md - Steg 1.3 seksjonen
Mål: Stopp agent før dårlige tasks starter

Din oppgave: Bygg confidence scoring system
Steg 1: Oppdater ai/ai.ts
Legg til ny interface:
typescriptinterface TaskConfidence {
  overall: number; // 0-100
  breakdown: {
    task_understanding: number;        // Forstår jeg hva som skal gjøres?
    codebase_familiarity: number;      // Kjenner jeg denne kodebasen?
    technical_complexity: number;       // Er dette teknisk gjennomførbart?
    test_coverage_feasible: number;    // Kan jeg teste dette?
  };
  uncertainties: string[];              // Liste over ting AI er usikker på
  recommended_action: "proceed" | "clarify" | "break_down";
  clarifying_questions?: string[];      // Spørsmål til user hvis "clarify"
  suggested_subtasks?: string[];        // Forslag hvis "break_down"
}

interface AssessConfidenceRequest {
  taskDescription: string;
  projectStructure: string;            // Fra github.getTree()
  relevantFiles: Array<{               // Fra github.findRelevantFiles()
    path: string;
    content: string;
  }>;
  memoryContext: string[];             // Fra memory.search()
  docsContext: string[];               // Fra docs.lookupForTask()
}

interface AssessConfidenceResponse {
  confidence: TaskConfidence;
  tokensUsed: number;
}
Legg til nytt system prompt i CONTEXT_PROMPTS:
typescriptconst CONTEXT_PROMPTS: Record<string, string> = {
  // ... existing prompts ...
  
  confidence_assessment: `${BASE_RULES}

You are assessing your own confidence in completing a task.

Be HONEST and CRITICAL. It's better to ask for clarification than to fail.

Analyze:
1. **Task Understanding (0-100):**
   - Is the task clearly defined?
   - Are there ambiguous requirements?
   - Do I understand the desired outcome?

2. **Codebase Familiarity (0-100):**
   - Have I seen this project structure before?
   - Do I understand the existing patterns?
   - Can I locate where changes should be made?

3. **Technical Complexity (0-100):**
   - Is this technically feasible?
   - Do I have the right tools/libraries?
   - Are there obvious blockers?

4. **Test Coverage Feasible (0-100):**
   - Can I write tests for this?
   - Are there existing test patterns to follow?
   - Is the change testable?

**Scoring Guidelines:**
- 90-100: Very confident, proceed immediately
- 70-89: Confident with minor uncertainties, proceed with caution
- 50-69: Moderate confidence, clarify specific points first
- Below 50: Low confidence, either clarify OR break into subtasks

**Recommended Actions:**
- "proceed": All scores >70, no major uncertainties
- "clarify": Some scores <70, need specific questions answered
- "break_down": Overall <60, task is too large/complex

Respond with JSON only. Be specific about uncertainties and questions.`,
};
Legg til nytt API endpoint:
typescriptexport const assessConfidence = api(
  { method: "POST", path: "/ai/assess-confidence", expose: false },
  async (req: AssessConfidenceRequest): Promise<AssessConfidenceResponse> => {
    const model = DEFAULT_MODEL; // Use Sonnet for assessment
    
    let prompt = `## Task to Assess\n${req.taskDescription}\n\n`;
    prompt += `## Project Structure\n\`\`\`\n${req.projectStructure}\n\`\`\`\n\n`;
    
    if (req.relevantFiles.length > 0) {
      prompt += `## Relevant Files\n`;
      req.relevantFiles.forEach((f) => {
        prompt += `### ${f.path}\n\`\`\`typescript\n${f.content}\n\`\`\`\n\n`;
      });
    }
    
    if (req.docsContext.length > 0) {
      prompt += `## Available Documentation\n`;
      req.docsContext.forEach((d, i) => {
        prompt += `${i + 1}. ${d}\n`;
      });
      prompt += "\n";
    }
    
    if (req.memoryContext.length > 0) {
      prompt += `## Past Context\n`;
      req.memoryContext.forEach((m, i) => {
        prompt += `${i + 1}. ${m}\n`;
      });
      prompt += "\n";
    }
    
    prompt += `Assess your confidence in completing this task. Respond with JSON only.`;
    
    const messages: ChatMessage[] = [{ role: "user", content: prompt }];
    
    const response = await callAI({
      model,
      system: CONTEXT_PROMPTS.confidence_assessment,
      messages,
      maxTokens: 4096,
    });
    
    try {
      const jsonText = stripMarkdownJson(response.content);
      const confidence = JSON.parse(jsonText) as TaskConfidence;
      
      // Validate and compute overall if not provided
      if (!confidence.overall) {
        const { breakdown } = confidence;
        confidence.overall = Math.round(
          (breakdown.task_understanding +
           breakdown.codebase_familiarity +
           breakdown.technical_complexity +
           breakdown.test_coverage_feasible) / 4
        );
      }
      
      return {
        confidence,
        tokensUsed: response.tokensUsed,
      };
    } catch (error) {
      throw APIError.internal("failed to parse confidence assessment as JSON");
    }
  }
);
Steg 2: Integrer i agent/agent.ts
Oppdater agent workflow:
typescript// I startTask() funksjonen, etter context gathering:

// --- STEP 2: Assess Confidence (NEW) ---
await report(ctx, "Vurderer min evne til å løse oppgaven...", "working");

const confidenceAssessment = await ai.assessConfidence({
  taskDescription: ctx.taskDescription,
  projectStructure: JSON.stringify(tree, null, 2),
  relevantFiles: relevantFiles.map((f) => ({
    path: f.path,
    content: f.content || "",
  })),
  memoryContext: memories.map((m) => m.text),
  docsContext: docsResults.map((d) => d.content),
});

const { confidence } = confidenceAssessment;

// Log confidence assessment
await audit.log(ctx.sessionId, "confidence_assessed", {
  overall: confidence.overall,
  breakdown: confidence.breakdown,
  recommended_action: confidence.recommended_action,
  uncertainties: confidence.uncertainties,
});

// --- Decision Logic Based on Confidence ---
if (confidence.overall < 60 || confidence.recommended_action === "clarify") {
  // LOW CONFIDENCE - Ask user for clarification
  let clarificationMessage = `⚠️ Jeg er usikker (${confidence.overall}% sikker) og trenger avklaringer:\n\n`;
  
  clarificationMessage += `**Usikkerheter:**\n`;
  confidence.uncertainties.forEach((u, i) => {
    clarificationMessage += `${i + 1}. ${u}\n`;
  });
  
  if (confidence.clarifying_questions && confidence.clarifying_questions.length > 0) {
    clarificationMessage += `\n**Spørsmål:**\n`;
    confidence.clarifying_questions.forEach((q, i) => {
      clarificationMessage += `${i + 1}. ${q}\n`;
    });
  }
  
  clarificationMessage += `\nVennligst gi mer informasjon før jeg starter.`;
  
  await report(ctx, clarificationMessage, "needs_input");
  return { status: "started", taskId: ctx.taskId };
}

if (confidence.overall < 75 || confidence.recommended_action === "break_down") {
  // MODERATE CONFIDENCE - Suggest breaking down
  let breakdownMessage = `🤔 Dette ser komplekst ut (${confidence.overall}% sikker). `;
  breakdownMessage += `Jeg anbefaler å dele det opp i mindre oppgaver:\n\n`;
  
  if (confidence.suggested_subtasks && confidence.suggested_subtasks.length > 0) {
    confidence.suggested_subtasks.forEach((task, i) => {
      breakdownMessage += `${i + 1}. ${task}\n`;
    });
  }
  
  breakdownMessage += `\nVil du at jeg skal fortsette likevel, eller dele det opp?`;
  
  await report(ctx, breakdownMessage, "needs_input");
  return { status: "started", taskId: ctx.taskId };
}

// HIGH CONFIDENCE - Proceed
await report(
  ctx,
  `✅ Jeg er ${confidence.overall}% sikker på å løse dette. Starter arbeid...`,
  "working"
);

// Continue with planning...
Steg 3: Database logging
Oppdater agent/migrations (eller legg i eksisterende audit-tabell):
sql-- If you don't have agent_audit_log yet, create it:
CREATE TABLE IF NOT EXISTS agent_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  action_type TEXT NOT NULL,
  details JSONB NOT NULL,
  success BOOLEAN,
  error_message TEXT
);

-- Add index for querying
CREATE INDEX IF NOT EXISTS idx_audit_session ON agent_audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON agent_audit_log(timestamp DESC);
Eller bruk eksisterende chat-tabell for å logge confidence:
typescript// I agent.ts, helper function:
async function logConfidence(
  sessionId: string,
  confidence: TaskConfidence
) {
  // Store in database for later analysis
  await db.exec`
    INSERT INTO agent_audit_log (session_id, action_type, details)
    VALUES (
      ${sessionId},
      'confidence_assessed',
      ${JSON.stringify(confidence)}
    )
  `;
}
Steg 4: Frontend display (optional enhancement)
I /chat eller /repo/[name]/chat, vis confidence visuelt:
tsx// components/ConfidenceDisplay.tsx
interface ConfidenceDisplayProps {
  confidence: {
    overall: number;
    breakdown: Record<string, number>;
  };
}

export function ConfidenceDisplay({ confidence }: ConfidenceDisplayProps) {
  const getColor = (score: number) => {
    if (score >= 80) return "var(--success)";
    if (score >= 60) return "var(--warning)";
    return "var(--error)";
  };
  
  return (
    <div className="confidence-widget">
      <div className="overall">
        <span style={{ color: getColor(confidence.overall) }}>
          {confidence.overall}% sikker
        </span>
      </div>
      
      <div className="breakdown">
        {Object.entries(confidence.breakdown).map(([key, value]) => (
          <div key={key} className="score-bar">
            <span>{key.replace(/_/g, " ")}</span>
            <div className="bar">
              <div 
                className="fill" 
                style={{ 
                  width: `${value}%`,
                  background: getColor(value)
                }}
              />
            </div>
            <span>{value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
Steg 5: Tester
Opprett ai/confidence.test.ts:
typescriptimport { describe, test, expect } from "vitest";
import { assessConfidence } from "./ai";

describe("confidence assessment", () => {
  test("high confidence for clear task", async () => {
    const result = await assessConfidence({
      taskDescription: "Add a GET /health endpoint that returns {status: 'ok'}",
      projectStructure: JSON.stringify({
        tree: [
          { path: "api/health.ts", type: "file" },
          { path: "api/users.ts", type: "file" },
        ],
      }),
      relevantFiles: [
        {
          path: "api/users.ts",
          content: `import { api } from "encore.dev/api";\nexport const getUser = api(...);`,
        },
      ],
      memoryContext: ["Project uses Encore.ts"],
      docsContext: ["Encore.ts API docs"],
    });
    
    expect(result.confidence.overall).toBeGreaterThanOrEqual(80);
    expect(result.confidence.recommended_action).toBe("proceed");
  });
  
  test("low confidence for vague task", async () => {
    const result = await assessConfidence({
      taskDescription: "Make it better",
      projectStructure: "{}",
      relevantFiles: [],
      memoryContext: [],
      docsContext: [],
    });
    
    expect(result.confidence.overall).toBeLessThan(60);
    expect(result.confidence.recommended_action).not.toBe("proceed");
    expect(result.confidence.uncertainties.length).toBeGreaterThan(0);
  });
  
  test("moderate confidence suggests break down", async () => {
    const result = await assessConfidence({
      taskDescription: "Build a complete e-commerce checkout flow with payment, shipping, and order confirmation",
      projectStructure: JSON.stringify({ tree: [] }),
      relevantFiles: [],
      memoryContext: [],
      docsContext: [],
    });
    
    expect(result.confidence.overall).toBeLessThan(75);
    expect(result.confidence.recommended_action).toBe("break_down");
    expect(result.confidence.suggested_subtasks).toBeDefined();
  });
});

Akseptansekriterer

 encore run starter uten feil
 encore test ./ai/... confidence tester grønne
 Agent vurderer confidence før task start
 Lav confidence (<60) → ber om klarhet
 Moderat confidence (<75) → foreslår breakup
 Høy confidence (>75) → fortsetter direkte
 Confidence logges i audit log
 Frontend viser confidence score (optional)


Viktige Design-prinsipper
1. Vær ærlig:
AI skal være kritisk mot seg selv - bedre å spørre enn å feile
2. Konkrete spørsmål:
Ikke "jeg er usikker" - men "Er dette en React eller Vue app?"
3. Metrics tracking:
Logg accuracy over tid: Hvis confidence=90% men task feiler → juster prompt
4. No false confidence:
AI skal IKKE si "jeg er 100% sikker" - alltid noen usikkerhet
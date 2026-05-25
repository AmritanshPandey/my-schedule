import type { DayKey, Plan, RitualColor } from "./useScheduleDB";

export interface AITask {
  title: string;
  day: DayKey;
  startTime: string;
  endTime: string;
  icon: string;
  subtasks?: string[];
}

export type AIActionResult =
  | { type: "create_plan"; payload: { title: string; description: string; emoji: string; color: string; startDate?: string; endDate?: string; tasks?: AITask[] } }
  | { type: "create_ritual"; payload: { title: string; time: string; duration: number; repeatDays: DayKey[]; color: RitualColor } }
  | { type: "create_strategy"; payload: { title: string; description: string; htmlContent: string } }
  | { type: "suggest_milestones"; payload: { milestones: Array<{ title: string; description: string; targetDate?: string }> } };

export const OLLAMA_URL_KEY = "planr_ollama_url";
export const OLLAMA_MODEL_KEY = "planr_ollama_model";
export const DEFAULT_OLLAMA_URL = "http://localhost:11434";
export const DEFAULT_OLLAMA_MODEL = "gemma3:4b";

const VALID_COLORS = ["blue", "emerald", "violet", "pink", "amber", "cyan"] as const;
const VALID_RITUAL_COLORS = ["rose", "sky", "violet", "amber", "emerald", "fuchsia", "orange", "cyan", "indigo", "teal"] as const;
const VALID_DAYS: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const SYSTEM_PROMPT: Record<"plans" | "routine" | "strategy", string> = {
  plans: `You are a planning assistant inside PlanR. Be concise — 1-2 sentences, then the JSON.

OUTPUT RULE: When creating a plan, output exactly one JSON block with the plan AND 3-5 tasks inside it:
\`\`\`json
{"type":"create_plan","payload":{"title":"Plan Title","description":"One sentence.","emoji":"barbell","color":"emerald","tasks":[{"title":"Task Name","day":"monday","startTime":"07:00","endTime":"08:00","icon":"run","subtasks":["Subtask 1","Subtask 2"]},{"title":"Task 2","day":"wednesday","startTime":"18:00","endTime":"19:00","icon":"barbell","subtasks":["Step A","Step B"]}]}}
\`\`\`
Rules:
- "emoji" and task "icon": pick from: run, school, book, sleep, star, briefcase, car, brain, barbell, code, heart, music, palette, plane, chefhat, coin, camera, users, leaf, pencil, yoga, bike, mountain, droplet, moodsmile, flame, language, pill, bolt, dna
- "color": blue, emerald, violet, pink, amber, or cyan
- "day": monday tuesday wednesday thursday friday saturday sunday
- Each task needs 2-4 subtasks. Times are HH:MM 24-hour.
- Add "startDate"/"endDate" (YYYY-MM-DD) only if user gives dates.
- ONE JSON block only. No explanation of the JSON.`,

  routine: `You are a routine coach inside PlanR. Be concise — reply in 2-3 sentences max, then the JSON if needed.

OUTPUT RULE: If the user wants a recurring habit or ritual, end your reply with exactly one JSON block:
\`\`\`json
{"type":"create_ritual","payload":{"title":"Habit Title","time":"07:00","duration":30,"repeatDays":["monday","tuesday","wednesday","thursday","friday"],"color":"emerald"}}
\`\`\`
Allowed colors: rose, sky, violet, amber, emerald, fuchsia. time is HH:MM. duration is minutes.
For a written guide use type "create_strategy" instead.
DO NOT explain the JSON. DO NOT output more than one JSON block. For questions, reply in 1-3 sentences only.`,

  strategy: `You are a strategy document writer for PlanR, a personal productivity app.
The user will describe a plan or goal. You will produce a comprehensive, well-formatted HTML strategy guide they can save and reference.

IMPORTANT — HTML FORMAT RULES:
1. Output a COMPLETE HTML document: <!DOCTYPE html>, <head> with <meta charset="UTF-8"> and a <style> block, and <body>.
2. Use only a <style> block for styling — no Tailwind, no Bootstrap, no external CDN links.
3. Base typography styles:
   body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.7; max-width: 680px; margin: 0 auto; padding: 2rem; color: #1a1a1a; }
   h1 { font-size: 1.8rem; color: #6366f1; margin-bottom: 0.5rem; }
   h2 { font-size: 1.15rem; font-weight: 700; color: #374151; margin: 1.75rem 0 0.5rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.25rem; }
   p, li { font-size: 0.95rem; color: #374151; }
   ul, ol { padding-left: 1.5rem; margin: 0.5rem 0; }
   table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.9rem; }
   th { background: #f3f4f6; text-align: left; padding: 0.5rem 0.75rem; font-weight: 600; }
   td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #e5e7eb; }
   .callout { border-left: 4px solid #6366f1; padding: 0.75rem 1rem; background: #f5f3ff; border-radius: 0 8px 8px 0; margin: 1rem 0; font-size: 0.9rem; }
4. STRUCTURE every strategy guide with these sections (use <h2> for section headings):
   - <h1> title
   - Overview (2-3 sentence summary of the strategy)
   - Key Principles (3-5 bullet points — core mindset or rules)
   - Schedule / Structure (weekly plan or phase breakdown as a table)
   - Daily Habits (micro-habits to build; can reference PlanR rituals)
   - Tips & Troubleshooting (3-5 practical tips)
   - Optional: Resources (books, tools, links as a plain list)
5. Use <div class="callout"> for 1-2 important highlighted notes.
6. Aim for 600-900 words of visible body text — comprehensive but scannable.

After your conversational response, output a SINGLE JSON code block:
\`\`\`json
{ "type": "create_strategy", "payload": { "title": "...", "description": "one-sentence summary", "htmlContent": "<!DOCTYPE html>..." } }
\`\`\`
The htmlContent must be a complete, self-contained HTML string. Escape any double-quotes inside it as \\". Only one JSON block per response.`,
};

export const PLAN_COACH_PROMPT = `You are an AI coach inside PlanR. Help the user develop and refine their plan through conversation.

Be concise, supportive, and specific to the plan details provided. Ask one clarifying question at a time.
When you have enough context to suggest milestones, include them as a JSON block at the END of your reply:
\`\`\`json
{"type":"suggest_milestones","payload":{"milestones":[{"title":"Week 1: ...","description":"one sentence","targetDate":"YYYY-MM-DD"}]}}
\`\`\`
Only output the JSON block when you have enough context to make specific suggestions.
Suggest 3–5 milestones spaced across the plan duration. Keep milestone titles concise (3–6 words).
ONE JSON block maximum per reply. Do not explain the JSON.`;

export function buildPlanContext(plan: Plan | undefined): string {
  if (!plan) return "";
  const parts = [`Plan: "${plan.title}"`, `Category: ${plan.category}`];
  if (plan.description) parts.push(`Description: ${plan.description}`);
  if (plan.startDate) parts.push(`Started: ${plan.startDate}`);
  if (plan.endDate) parts.push(`Target end: ${plan.endDate}`);
  return parts.join(". ");
}

export function buildSystemPrompt(
  context: "plans" | "routine" | "strategy",
  planContext?: string,
  existingPlans?: Pick<Plan, "title" | "category" | "description">[],
  existingRituals?: Pick<{ title: string; time: string; duration?: number }, "title" | "time" | "duration">[],
): string {
  const parts: string[] = [SYSTEM_PROMPT[context]];
  if (planContext) parts.push(`Current plan context: ${planContext}`);
  if (existingPlans && existingPlans.length > 0) {
    const list = existingPlans.map((p) => `- "${p.title}" (${p.category}${p.description ? `: ${p.description}` : ""})`).join("\n");
    parts.push(`User's existing plans:\n${list}`);
  }
  if (existingRituals && existingRituals.length > 0) {
    const list = existingRituals.map((r) => `- "${r.title}" at ${r.time}${r.duration ? `, ${r.duration}min` : ""}`).join("\n");
    parts.push(`User's existing rituals:\n${list}`);
  }
  return parts.join("\n\n");
}

// Lower temperature = more deterministic/accurate structured output.
// num_ctx ensures the full conversation + system prompt fits in context.
const OLLAMA_OPTIONS = {
  temperature: 0.35,
  top_p: 0.9,
  top_k: 40,
  repeat_penalty: 1.1,
  num_ctx: 8192,
  num_predict: 512,  // cap response length — increase for strategy context
};

export async function* streamOllamaChat(
  baseUrl: string,
  model: string,
  messages: { role: "user" | "assistant"; content: string }[],
  systemPrompt: string,
  isStrategy = false,
): AsyncGenerator<string> {
  const allMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messages,
  ];

  const options = isStrategy
    ? { ...OLLAMA_OPTIONS, num_predict: 2048 }
    : { ...OLLAMA_OPTIONS, num_predict: 1024 };

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: allMessages, stream: true, options }),
    });
  } catch {
    throw new Error("Ollama not reachable — is it running? Start with: ollama serve");
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`Ollama error ${response.status}: ${errText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body from Ollama");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const data = JSON.parse(trimmed);
        if (!data.done && data.message?.content) {
          yield data.message.content as string;
        }
      } catch {
        // skip malformed lines
      }
    }
  }
}

function tryParseJSON(raw: string): { type?: string; payload?: unknown } | null {
  const cleaned = raw
    .trim()
    .replace(/,\s*([}\]])/g, "$1")   // trailing commas
    .replace(/'/g, '"');              // single → double quotes
  try {
    return JSON.parse(cleaned) as { type?: string; payload?: unknown };
  } catch {
    return null;
  }
}

function extractJSONCandidate(text: string): string | null {
  // 1. Prefer fenced ```json … ``` blocks (take the last one)
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)];
  if (fenced.length > 0) return fenced[fenced.length - 1][1];
  // 2. Fall back to the last bare {...} object in the text
  const bare = [...text.matchAll(/\{[\s\S]*?\}/g)];
  if (bare.length > 0) return bare[bare.length - 1][0];
  return null;
}

export function parseAIAction(text: string): AIActionResult | null {
  const candidate = extractJSONCandidate(text);
  if (!candidate) return null;
  const parsed = tryParseJSON(candidate);
  if (!parsed) return null;
  try {
    if (parsed.type === "create_plan") {
      const p = parsed.payload as Record<string, unknown>;
      if (typeof p?.title !== "string") return null;
      const rawTasks = Array.isArray(p.tasks) ? p.tasks : [];
      const tasks: AITask[] = rawTasks
        .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null && typeof (t as Record<string,unknown>).title === "string")
        .map((t) => ({
          title: String(t.title),
          day: VALID_DAYS.includes(t.day as DayKey) ? (t.day as DayKey) : "monday",
          startTime: typeof t.startTime === "string" ? t.startTime : "09:00",
          endTime: typeof t.endTime === "string" ? t.endTime : "10:00",
          icon: typeof t.icon === "string" ? t.icon : "star",
          subtasks: Array.isArray(t.subtasks) ? t.subtasks.filter((s): s is string => typeof s === "string") : [],
        }));
      return {
        type: "create_plan",
        payload: {
          title: String(p.title),
          description: String(p.description ?? ""),
          emoji: String(p.emoji ?? "brain"),
          color: VALID_COLORS.includes(p.color as typeof VALID_COLORS[number]) ? String(p.color) : "cyan",
          startDate: typeof p.startDate === "string" ? p.startDate : undefined,
          endDate: typeof p.endDate === "string" ? p.endDate : undefined,
          tasks: tasks.length > 0 ? tasks : undefined,
        },
      };
    }
    if (parsed.type === "create_ritual") {
      const p = parsed.payload as Record<string, unknown>;
      if (typeof p?.title !== "string") return null;
      const rawDays = Array.isArray(p.repeatDays) ? p.repeatDays : [];
      const repeatDays = rawDays.filter((d) => VALID_DAYS.includes(d as DayKey)) as DayKey[];
      return {
        type: "create_ritual",
        payload: {
          title: String(p.title),
          time: typeof p.time === "string" ? p.time : "08:00",
          duration: typeof p.duration === "number" ? p.duration : 30,
          repeatDays: repeatDays.length > 0 ? repeatDays : VALID_DAYS,
          color: VALID_RITUAL_COLORS.includes(p.color as RitualColor) ? (p.color as RitualColor) : "emerald",
        },
      };
    }
    if (parsed.type === "create_strategy") {
      const p = parsed.payload as Record<string, unknown>;
      if (typeof p?.title !== "string") return null;
      return {
        type: "create_strategy",
        payload: {
          title: String(p.title),
          description: String(p.description ?? ""),
          htmlContent: String(p.htmlContent ?? ""),
        },
      };
    }
    if (parsed.type === "suggest_milestones") {
      const raw = Array.isArray((parsed.payload as Record<string, unknown>)?.milestones)
        ? (parsed.payload as Record<string, unknown>).milestones as unknown[]
        : [];
      return {
        type: "suggest_milestones",
        payload: {
          milestones: raw
            .filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null && typeof (m as Record<string, unknown>).title === "string")
            .map((m) => ({
              title: String(m.title),
              description: typeof m.description === "string" ? m.description : "",
              targetDate: typeof m.targetDate === "string" ? m.targetDate : undefined,
            })),
        },
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function checkOllamaConnection(baseUrl: string): Promise<string[]> {
  const response = await fetch(`${baseUrl}/api/tags`, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json() as { models?: { name: string }[] };
  return (data.models ?? []).map((m) => m.name);
}

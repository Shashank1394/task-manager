type TaskDraftPriority = "LOW" | "MEDIUM" | "HIGH";
type TaskDraftStatus = "TODO" | "IN_PROGRESS" | "DONE";

export type TaskDraft = {
  title: string;
  description: string;
  priority: TaskDraftPriority;
  status: TaskDraftStatus;
  acceptanceCriteria: string[];
  reasoning: string;
};

export type TaskDraftEnvelope<TSnapshot> = {
  source: "rules" | "llm";
  generatedAt: string;
  draft: TaskDraft;
  snapshot: TSnapshot;
};

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_MODEL = "qwen:4b";
const OLLAMA_TIMEOUT_MS = 8000;
const PRIORITY_VALUES = ["LOW", "MEDIUM", "HIGH"] as const;
const STATUS_VALUES = ["TODO", "IN_PROGRESS", "DONE"] as const;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function clipWords(value: string, wordLimit: number, charLimit: number) {
  const words = value.split(/\s+/).filter(Boolean);
  const clipped = words.slice(0, wordLimit).join(" ");

  if (clipped.length <= charLimit) {
    return clipped;
  }

  return `${clipped.slice(0, charLimit - 1).trimEnd()}…`;
}

function extractCandidateLines(rawText: string) {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\-\*\d.)\s]+/, "").trim())
    .filter(Boolean);
}

function buildTitle(rawText: string, projectName: string) {
  const lines = extractCandidateLines(rawText);
  const initial = lines[0] ?? normalizeWhitespace(rawText);
  const cleaned = initial
    .replace(/^(please|can you|we need to|need to|todo:|task:)/i, "")
    .replace(/[.!?]+$/, "")
    .trim();

  if (cleaned.length < 3) {
    return `Follow up for ${projectName}`;
  }

  return clipWords(cleaned, 10, 90);
}

function inferPriority(rawText: string): TaskDraftPriority {
  if (
    /urgent|asap|critical|blocker|today|this week|before demo|presentation|investor|launch/i.test(
      rawText,
    )
  ) {
    return "HIGH";
  }

  if (/later|eventually|nice to have|optional|someday/i.test(rawText)) {
    return "LOW";
  }

  return "MEDIUM";
}

function inferStatus(rawText: string): TaskDraftStatus {
  if (/shipped|done|completed|resolved/i.test(rawText)) {
    return "DONE";
  }

  if (
    /in progress|already started|underway|working on|ongoing/i.test(rawText)
  ) {
    return "IN_PROGRESS";
  }

  return "TODO";
}

function ensureSentence(value: string) {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function buildAcceptanceCriteria(args: {
  rawText: string;
  projectName: string;
  activeSprintName: string | null;
}) {
  const lines = extractCandidateLines(args.rawText);
  const candidates = lines.slice(1, 4);
  const criteria = candidates.map((item) => ensureSentence(item)).slice(0, 3);

  if (criteria.length >= 2) {
    return criteria;
  }

  const fallbacks = [
    `The requested outcome for ${args.projectName} is clearly captured in the task description.`,
    args.activeSprintName
      ? `The work is ready to be reviewed during ${args.activeSprintName} planning.`
      : "Priority, owner, and timing can be confirmed during planning.",
    "Any urgency or delivery constraint from the source note stays visible in the task details.",
  ];

  return [...criteria, ...fallbacks].slice(0, 3);
}

function buildDescription(args: {
  rawText: string;
  activeSprintName: string | null;
}) {
  const normalized = normalizeWhitespace(args.rawText);
  const body =
    normalized.length <= 280
      ? normalized
      : `${normalized.slice(0, 277).trimEnd()}...`;
  const planningNote = args.activeSprintName
    ? `Scope it against ${args.activeSprintName} if it needs to land in the current sprint.`
    : "Confirm the owner and timing during the next planning pass.";

  return `${ensureSentence(body)} ${planningNote}`;
}

function normalizeString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);

  return normalized.length > 0 ? normalized : fallback;
}

function normalizePriority(value: unknown, fallback: TaskDraftPriority) {
  return PRIORITY_VALUES.includes(value as TaskDraftPriority)
    ? (value as TaskDraftPriority)
    : fallback;
}

function normalizeStatus(value: unknown, fallback: TaskDraftStatus) {
  return STATUS_VALUES.includes(value as TaskDraftStatus)
    ? (value as TaskDraftStatus)
    : fallback;
}

function extractContent(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as {
    message?: {
      content?: string;
    };
    response?: string;
  };

  if (typeof record.message?.content === "string") {
    return record.message.content;
  }

  if (typeof record.response === "string") {
    return record.response;
  }

  return null;
}

function resolveOllamaModel() {
  return (process.env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL).trim();
}

function parseTaskDraft(content: string, fallback: TaskDraft) {
  try {
    const parsed = JSON.parse(content) as Partial<TaskDraft>;

    return {
      title: normalizeString(parsed.title, fallback.title),
      description: normalizeString(parsed.description, fallback.description),
      priority: normalizePriority(parsed.priority, fallback.priority),
      status: normalizeStatus(parsed.status, fallback.status),
      acceptanceCriteria: normalizeList(
        parsed.acceptanceCriteria,
        fallback.acceptanceCriteria,
      ),
      reasoning: normalizeString(parsed.reasoning, fallback.reasoning),
    };
  } catch {
    return fallback;
  }
}

export function buildRuleTaskDraft(args: {
  rawText: string;
  projectName: string;
  activeSprintName: string | null;
}) {
  const priority = inferPriority(args.rawText);
  const status = inferStatus(args.rawText);

  return {
    source: "rules" as const,
    generatedAt: new Date().toISOString(),
    draft: {
      title: buildTitle(args.rawText, args.projectName),
      description: buildDescription({
        rawText: args.rawText,
        activeSprintName: args.activeSprintName,
      }),
      priority,
      status,
      acceptanceCriteria: buildAcceptanceCriteria(args),
      reasoning:
        status === "IN_PROGRESS"
          ? "The note already sounds like active work, so the draft keeps it in progress."
          : `The draft keeps the clearest requested outcome and marks it ${priority.toLowerCase()} priority based on the urgency in the note.`,
    },
    snapshot: {
      projectName: args.projectName,
      activeSprintName: args.activeSprintName,
      sourceLength: args.rawText.length,
    },
  };
}

export async function maybeGenerateTaskDraftWithModel<TSnapshot>(args: {
  fallback: TaskDraftEnvelope<TSnapshot>;
  context: Record<string, unknown>;
}) {
  const baseUrl = (
    process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL
  ).replace(/\/$/, "");
  const model = resolveOllamaModel();

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        options: {
          temperature: 0.2,
        },
        messages: [
          {
            role: "system",
            content:
              "You turn messy delivery notes into structured task drafts. Return JSON with title, description, priority, status, acceptanceCriteria, and reasoning. Keep the title action-oriented, the description concise, and every field plain text with no markdown.",
          },
          {
            role: "user",
            content: JSON.stringify({
              instructions: [
                "Create a concise implementation-ready task draft from the raw note.",
                "Use 2-4 acceptance criteria that make the work easy to verify.",
                "Prefer TODO unless the note clearly says work is already underway.",
                "Infer HIGH priority only when urgency or near-term delivery pressure is explicit.",
                "Avoid duplicating the wording of existing task titles when a clearer action title is available.",
                "Do not invent technical details that are not present in the note or project context.",
              ],
              context: args.context,
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      return args.fallback;
    }

    const payload = (await response.json()) as unknown;
    const content = extractContent(payload);

    if (!content) {
      return args.fallback;
    }

    const draft = parseTaskDraft(content, args.fallback.draft);

    return {
      ...args.fallback,
      draft,
      source: "llm" as const,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return args.fallback;
  }
}

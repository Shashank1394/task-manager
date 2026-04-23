type DigestSections = {
  summary: string;
  highlights: string[];
  risks: string[];
  nextSteps: string[];
};

type EtaConfidence = "LOW" | "MEDIUM" | "HIGH";

export type EtaReport = {
  projectedCompletionDate: string | null;
  confidence: EtaConfidence;
  summary: string;
  assumptions: string[];
};

type DigestEnvelope<TSnapshot> = DigestSections & {
  source: "rules" | "llm";
  generatedAt: string;
  snapshot: TSnapshot;
};

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_MODEL = "qwen:4b";
const DIGEST_CACHE_TTL_MS = 2 * 60 * 1000;
const OLLAMA_TIMEOUT_MS = 8000;

const digestCache = new Map<
  string,
  { expiresAt: number; result: DigestEnvelope<unknown> }
>();
const etaCache = new Map<string, { expiresAt: number; result: EtaReport }>();

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
    .slice(0, 3);

  return normalized.length > 0 ? normalized : fallback;
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

function buildEtaCacheKey(args: {
  context: Record<string, unknown>;
  instructions?: string[];
  voice?: string;
  model: string;
  baseUrl: string;
}) {
  return JSON.stringify({
    kind: "eta",
    context: args.context,
    instructions: args.instructions ?? [],
    voice: args.voice ?? null,
    model: args.model,
    baseUrl: args.baseUrl,
  });
}

function buildDigestCacheKey(args: {
  audience: string;
  context: Record<string, unknown>;
  instructions?: string[];
  voice?: string;
  model: string;
  baseUrl: string;
}) {
  return JSON.stringify({
    audience: args.audience,
    context: args.context,
    instructions: args.instructions ?? [],
    voice: args.voice ?? null,
    model: args.model,
    baseUrl: args.baseUrl,
  });
}

function getCachedDigest<TSnapshot>(cacheKey: string) {
  const cached = digestCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    digestCache.delete(cacheKey);
    return null;
  }

  return cached.result as DigestEnvelope<TSnapshot>;
}

function setCachedDigest<TSnapshot>(
  cacheKey: string,
  result: DigestEnvelope<TSnapshot>,
) {
  digestCache.set(cacheKey, {
    expiresAt: Date.now() + DIGEST_CACHE_TTL_MS,
    result: result as DigestEnvelope<unknown>,
  });
}

function getCachedEtaReport(cacheKey: string) {
  const cached = etaCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    etaCache.delete(cacheKey);
    return null;
  }

  return cached.result;
}

function setCachedEtaReport(cacheKey: string, result: EtaReport) {
  etaCache.set(cacheKey, {
    expiresAt: Date.now() + DIGEST_CACHE_TTL_MS,
    result,
  });
}

export function resetDigestCacheForTests() {
  digestCache.clear();
  etaCache.clear();
}

function parseSections(content: string, fallback: DigestSections) {
  try {
    const parsed = JSON.parse(content) as Partial<DigestSections>;
    return {
      summary: normalizeString(parsed.summary, fallback.summary),
      highlights: normalizeList(parsed.highlights, fallback.highlights),
      risks: normalizeList(parsed.risks, fallback.risks),
      nextSteps: normalizeList(parsed.nextSteps, fallback.nextSteps),
    };
  } catch {
    return fallback;
  }
}

function normalizeConfidence(value: unknown, fallback: EtaConfidence) {
  return value === "LOW" || value === "MEDIUM" || value === "HIGH"
    ? value
    : fallback;
}

function normalizeEtaDate(value: unknown, fallback: string | null) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed.toISOString();
}

function normalizeAssumptions(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);

  return normalized.length > 0 ? normalized : fallback;
}

function parseEtaReport(content: string, fallback: EtaReport) {
  try {
    const parsed = JSON.parse(content) as Partial<EtaReport>;

    return {
      projectedCompletionDate: normalizeEtaDate(
        parsed.projectedCompletionDate,
        fallback.projectedCompletionDate,
      ),
      confidence: normalizeConfidence(parsed.confidence, fallback.confidence),
      summary: normalizeString(parsed.summary, fallback.summary),
      assumptions: normalizeAssumptions(
        parsed.assumptions,
        fallback.assumptions,
      ),
    };
  } catch {
    return fallback;
  }
}

export async function maybeGenerateDigestWithModel<TSnapshot>(args: {
  audience: string;
  context: Record<string, unknown>;
  fallback: DigestEnvelope<TSnapshot>;
  instructions?: string[];
  voice?: string;
}) {
  const baseUrl = (
    process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL
  ).replace(/\/$/, "");
  const model = resolveOllamaModel();
  const cacheKey = buildDigestCacheKey({
    audience: args.audience,
    context: args.context,
    instructions: args.instructions,
    voice: args.voice,
    model,
    baseUrl,
  });
  const cached = getCachedDigest<TSnapshot>(cacheKey);

  if (cached) {
    return cached;
  }

  const instructions = [
    "Write one summary sentence that names the main project, sprint, or organization from context.",
    "Provide 2-3 highlights, 1-3 risks, and 1-3 next steps.",
    "Reference exact project, sprint, organization, and task names from context whenever available.",
    "Prefer concrete counts, completion percentages, due work, and recent changes over generic management language.",
    "Avoid filler phrases like 'keep momentum', 'stay aligned', 'moving forward', or 'continue monitoring' unless tied to a named item from context.",
    "Do not invent data that is not present in the context.",
    ...(args.instructions ?? []),
  ];

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
            content: `You are ${args.voice ?? "a delivery analyst"} writing concise JSON briefings from structured project data. Return an object with summary, highlights, risks, and nextSteps. Each field must be plain text. Keep it specific, concrete, and free of markdown.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              audience: args.audience,
              instructions,
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

    const sections = parseSections(content, args.fallback);

    const result = {
      ...args.fallback,
      ...sections,
      source: "llm" as const,
      generatedAt: new Date().toISOString(),
    };

    setCachedDigest(cacheKey, result);

    return result;
  } catch {
    return args.fallback;
  }
}

export async function maybeGenerateEtaReportWithModel(args: {
  context: Record<string, unknown>;
  fallback: EtaReport;
  instructions?: string[];
  voice?: string;
}) {
  const baseUrl = (
    process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL
  ).replace(/\/$/, "");
  const model = resolveOllamaModel();
  const cacheKey = buildEtaCacheKey({
    context: args.context,
    instructions: args.instructions,
    voice: args.voice,
    model,
    baseUrl,
  });
  const cached = getCachedEtaReport(cacheKey);

  if (cached) {
    return cached;
  }

  const instructions = [
    "Return JSON with projectedCompletionDate, confidence, summary, and assumptions.",
    "Keep confidence to LOW, MEDIUM, or HIGH.",
    "Use projectedCompletionDate as an ISO timestamp when a forecast date is defensible, otherwise return null.",
    "Do not promise certainty when overdue work, ownership gaps, or missing dates make the forecast weaker.",
    "Use the provided fallback anchor as a guardrail instead of inventing a dramatically different forecast.",
    ...(args.instructions ?? []),
  ];

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
            content: `You are ${args.voice ?? "a delivery forecasting analyst"} estimating project completion windows from structured execution data. Return JSON only.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              instructions,
              fallbackAnchor: args.fallback,
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

    const result = parseEtaReport(content, args.fallback);
    setCachedEtaReport(cacheKey, result);

    return result;
  } catch {
    return args.fallback;
  }
}

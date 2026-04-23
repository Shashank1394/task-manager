import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  maybeGenerateDigestWithModel,
  resetDigestCacheForTests,
} from "@/lib/ai-digest";

const fallbackDigest = {
  source: "rules" as const,
  generatedAt: "2026-04-23T10:00:00.000Z",
  summary: "Fallback summary",
  highlights: ["Fallback highlight"],
  risks: ["Fallback risk"],
  nextSteps: ["Fallback next step"],
  snapshot: { totalTasks: 3 },
};

describe("ai-digest", () => {
  beforeEach(() => {
    resetDigestCacheForTests();
    vi.unstubAllGlobals();
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_MODEL;
  });

  it("caches successful Ollama briefs for repeated identical requests", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            message: {
              content: JSON.stringify({
                summary: "LLM summary",
                highlights: ["LLM highlight"],
                risks: ["LLM risk"],
                nextSteps: ["LLM next step"],
              }),
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = await maybeGenerateDigestWithModel({
      audience: "internal product and delivery team",
      voice:
        "an engineering operations analyst writing short, decisive internal delivery briefs",
      instructions: ["Anchor the brief on the active sprint."],
      context: {
        projectName: "Roadmap",
        activeSprintName: "Release Sprint",
      },
      fallback: fallbackDigest,
    });

    const second = await maybeGenerateDigestWithModel({
      audience: "internal product and delivery team",
      voice:
        "an engineering operations analyst writing short, decisive internal delivery briefs",
      instructions: ["Anchor the brief on the active sprint."],
      context: {
        projectName: "Roadmap",
        activeSprintName: "Release Sprint",
      },
      fallback: fallbackDigest,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({
      source: "llm",
      summary: "LLM summary",
    });
    expect(second).toEqual(first);
  });

  it("does not cache fallback results when Ollama generation fails", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("ollama down")));
    vi.stubGlobal("fetch", fetchMock);

    const first = await maybeGenerateDigestWithModel({
      audience: "client stakeholder",
      voice: "a delivery lead writing calm, external-facing client updates",
      instructions: [
        "Use visible project names and completion percentages as proof points.",
      ],
      context: {
        organizationName: "Platform Team",
      },
      fallback: fallbackDigest,
    });

    const second = await maybeGenerateDigestWithModel({
      audience: "client stakeholder",
      voice: "a delivery lead writing calm, external-facing client updates",
      instructions: [
        "Use visible project names and completion percentages as proof points.",
      ],
      context: {
        organizationName: "Platform Team",
      },
      fallback: fallbackDigest,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(first).toEqual(fallbackDigest);
    expect(second).toEqual(fallbackDigest);
  });
});

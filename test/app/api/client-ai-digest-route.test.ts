import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  organizationMember: {
    findFirst: vi.fn(),
  },
  organization: {
    findUnique: vi.fn(),
  },
  projectClient: {
    findMany: vi.fn(),
  },
  project: {
    findMany: vi.fn(),
  },
}));

const requireAuthMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-server", () => ({ requireAuth: requireAuthMock }));

import { GET } from "@/app/api/client/[orgId]/ai-digest/route";

describe("client ai digest route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    prismaMock.organizationMember.findFirst.mockReset();
    prismaMock.organization.findUnique.mockReset();
    prismaMock.projectClient.findMany.mockReset();
    prismaMock.project.findMany.mockReset();
    vi.unstubAllGlobals();
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_MODEL;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("ollama unavailable"))),
    );

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns a client-safe digest from visible project progress", async () => {
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({
      role: "CLIENT",
    });
    prismaMock.organization.findUnique.mockResolvedValueOnce({
      id: "org-1",
      name: "Platform Team",
    });
    prismaMock.projectClient.findMany.mockResolvedValueOnce([
      { projectId: "project-1" },
    ]);
    prismaMock.project.findMany.mockResolvedValueOnce([
      {
        id: "project-1",
        name: "Roadmap",
        board: {
          tasks: [
            { status: "TODO" },
            { status: "DONE" },
            { status: "IN_PROGRESS" },
          ],
        },
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/client/org-1/ai-digest"),
      { params: Promise.resolve({ orgId: "org-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      source: "rules",
      summary: expect.stringContaining(
        "Platform Team currently has 1 project in view",
      ),
      highlights: expect.arrayContaining([
        expect.stringContaining("1 task is complete"),
        expect.stringContaining("Roadmap is the furthest along"),
      ]),
      snapshot: {
        projectCount: 1,
        totalTasks: 3,
        totalDone: 1,
        totalInProgress: 1,
        totalTodo: 1,
        overallCompletion: 33,
      },
    });
  });
});

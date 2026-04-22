import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

const requireAuthMock = vi.hoisted(() => vi.fn());
const checkClientProjectAccessMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-server", () => ({
  requireAuth: requireAuthMock,
  checkClientProjectAccess: checkClientProjectAccessMock,
}));

import { DELETE, PATCH } from "@/app/api/projects/[projectId]/route";

describe("project route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    checkClientProjectAccessMock.mockReset();
    prismaMock.project.findUnique.mockReset();
    prismaMock.project.update.mockReset();
    prismaMock.project.delete.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("rejects project updates from non-admin members", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "project-1",
      name: "Roadmap",
      description: null,
      organizationId: "org-1",
      board: { id: "board-1" },
      organization: {
        members: [{ userId: "user-1", role: "MEMBER" }],
      },
    });

    const request = new Request("http://localhost/api/projects/project-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated project" }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Admin access required",
      code: "FORBIDDEN",
    });
    expect(prismaMock.project.update).not.toHaveBeenCalled();
  });

  it("clears GitHub metadata when disconnecting a repository", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "project-1",
      name: "Roadmap",
      description: "Client work",
      organizationId: "org-1",
      board: { id: "board-1" },
      organization: {
        members: [{ userId: "user-1", role: "ADMIN" }],
      },
    });
    prismaMock.project.update.mockResolvedValueOnce({
      id: "project-1",
      name: "Roadmap",
      description: "Client work",
      repoOwner: null,
      repoName: null,
    });

    const request = new Request("http://localhost/api/projects/project-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disconnectGitHub: true }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(200);
    expect(prismaMock.project.update).toHaveBeenCalledWith({
      where: { id: "project-1" },
      data: {
        repoProvider: null,
        repoOwner: null,
        repoName: null,
        webhookSecret: null,
        webhookId: null,
      },
    });
    await expect(response.json()).resolves.toEqual({
      id: "project-1",
      name: "Roadmap",
      description: "Client work",
      repoOwner: null,
      repoName: null,
    });
  });

  it("allows admins to delete a project", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "project-1",
      name: "Roadmap",
      description: null,
      organizationId: "org-1",
      board: { id: "board-1" },
      organization: {
        members: [{ userId: "user-1", role: "ADMIN" }],
      },
    });
    prismaMock.project.delete.mockResolvedValueOnce({ id: "project-1" });

    const request = new Request("http://localhost/api/projects/project-1", {
      method: "DELETE",
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true });
    expect(prismaMock.project.delete).toHaveBeenCalledWith({
      where: { id: "project-1" },
    });
  });
});

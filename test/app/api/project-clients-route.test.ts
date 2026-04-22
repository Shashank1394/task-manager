import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
  },
  projectClient: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
  organizationMember: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
}));

const requireAuthMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-server", () => ({ requireAuth: requireAuthMock }));

import {
  DELETE,
  GET,
  POST,
} from "@/app/api/projects/[projectId]/clients/route";

describe("project clients route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    prismaMock.project.findUnique.mockReset();
    prismaMock.projectClient.findMany.mockReset();
    prismaMock.projectClient.findUnique.mockReset();
    prismaMock.projectClient.create.mockReset();
    prismaMock.projectClient.deleteMany.mockReset();
    prismaMock.user.findUnique.mockReset();
    prismaMock.organizationMember.findUnique.mockReset();
    prismaMock.organizationMember.create.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns 403 when non-members try to view project clients", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "project-1",
      organizationId: "org-1",
      organization: { members: [{ userId: "user-1", role: "CLIENT" }] },
    });

    const response = await GET(
      new Request("http://localhost/api/projects/project-1/clients"),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Forbidden",
      code: "FORBIDDEN",
    });
  });

  it("returns 400 for invalid client invite payloads", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "project-1",
      organizationId: "org-1",
      organization: { members: [{ userId: "user-1", role: "ADMIN" }] },
    });

    const response = await POST(
      new Request("http://localhost/api/projects/project-1/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid client invite payload",
      code: "BAD_REQUEST",
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("invites a user and adds missing org membership as CLIENT", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "project-1",
      organizationId: "org-1",
      organization: { members: [{ userId: "user-1", role: "ADMIN" }] },
    });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-2",
      email: "client@example.com",
    });
    prismaMock.projectClient.findUnique.mockResolvedValueOnce(null);
    prismaMock.organizationMember.findUnique.mockResolvedValueOnce(null);
    prismaMock.organizationMember.create.mockResolvedValueOnce({
      id: "membership-1",
    });
    prismaMock.projectClient.create.mockResolvedValueOnce({
      id: "client-1",
      user: {
        id: "user-2",
        name: "Client",
        email: "client@example.com",
        image: null,
      },
    });

    const response = await POST(
      new Request("http://localhost/api/projects/project-1/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "client@example.com" }),
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(201);
    expect(prismaMock.organizationMember.create).toHaveBeenCalledWith({
      data: {
        userId: "user-2",
        organizationId: "org-1",
        role: "CLIENT",
      },
    });
    expect(prismaMock.projectClient.create).toHaveBeenCalledWith({
      data: {
        userId: "user-2",
        projectId: "project-1",
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });
    await expect(response.json()).resolves.toEqual({
      id: "client-1",
      user: {
        id: "user-2",
        name: "Client",
        email: "client@example.com",
        image: null,
      },
    });
  });

  it("returns 404 when deleting a client outside the project scope", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({
      id: "project-1",
      organizationId: "org-1",
      organization: { members: [{ userId: "user-1", role: "ADMIN" }] },
    });
    prismaMock.projectClient.deleteMany.mockResolvedValueOnce({ count: 0 });

    const response = await DELETE(
      new Request("http://localhost/api/projects/project-1/clients", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: "client-1" }),
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Project client not found",
      code: "NOT_FOUND",
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  notification: {
    findMany: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
  },
}));

const requireAuthMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-server", () => ({ requireAuth: requireAuthMock }));

import { GET, PATCH } from "@/app/api/notifications/route";

describe("notifications route", () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    prismaMock.notification.findMany.mockReset();
    prismaMock.notification.count.mockReset();
    prismaMock.notification.updateMany.mockReset();

    requireAuthMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("lists notifications and unread count for the current user", async () => {
    prismaMock.notification.findMany.mockResolvedValueOnce([
      { id: "notif-1", message: "Assigned to task", read: false },
    ]);
    prismaMock.notification.count.mockResolvedValueOnce(1);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(prismaMock.notification.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    expect(prismaMock.notification.count).toHaveBeenCalledWith({
      where: { userId: "user-1", read: false },
    });
    await expect(response.json()).resolves.toEqual({
      notifications: [
        { id: "notif-1", message: "Assigned to task", read: false },
      ],
      unreadCount: 1,
    });
  });

  it("returns 400 for invalid notification update payloads", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [] }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid notification update payload",
      code: "BAD_REQUEST",
    });
    expect(prismaMock.notification.updateMany).not.toHaveBeenCalled();
  });

  it("marks all notifications as read for the current user", async () => {
    prismaMock.notification.updateMany.mockResolvedValueOnce({ count: 4 });

    const response = await PATCH(
      new Request("http://localhost/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      }),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", read: false },
      data: { read: true },
    });
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});

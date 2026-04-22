import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: {
    count: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET } from "@/app/api/db-test/route";

describe("db-test route", () => {
  beforeEach(() => {
    prismaMock.user.count.mockReset();
  });

  it("returns connected database metadata", async () => {
    prismaMock.user.count.mockResolvedValueOnce(3);

    const response = await GET();

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.db).toBe("connected");
    expect(payload.users).toBe(3);
    expect(typeof payload.timestamp).toBe("string");
  });

  it("returns 500 when the database check fails", async () => {
    prismaMock.user.count.mockRejectedValueOnce(new Error("db down"));

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      db: "error",
      error: "Error: db down",
    });
  });
});

import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/health/route";

describe("health route", () => {
  it("returns ok health status with an ISO timestamp", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.status).toBe("ok");
    expect(typeof payload.timestamp).toBe("string");
    expect(Number.isNaN(Date.parse(payload.timestamp))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  badRequest,
  handleRouteError,
  isUnauthorizedError,
} from "@/lib/api-errors";

describe("api-errors", () => {
  it("recognizes both unauthorized error variants", () => {
    expect(isUnauthorizedError(new Error("UNAUTHORIZED"))).toBe(true);
    expect(isUnauthorizedError(new Error("Unauthorized"))).toBe(true);
    expect(isUnauthorizedError(new Error("Something else"))).toBe(false);
  });

  it("maps auth failures to a 401 response", async () => {
    const response = handleRouteError(new Error("UNAUTHORIZED"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized",
      code: "UNAUTHORIZED",
    });
  });

  it("preserves structured ApiError payloads", async () => {
    const response = handleRouteError(
      badRequest("Invalid payload", { fieldErrors: { title: ["Too short"] } }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid payload",
      code: "BAD_REQUEST",
      details: { fieldErrors: { title: ["Too short"] } },
    });
  });
});

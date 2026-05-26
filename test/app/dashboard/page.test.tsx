// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());
const requireAuthMock = vi.hoisted(() => vi.fn());
const findManyMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth-server", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMember: {
      findMany: findManyMock,
    },
  },
}));

vi.mock("@/app/components/DashboardHome", () => ({
  default: () => <div>Developer dashboard</div>,
}));

import DashboardPage from "@/app/dashboard/page";

describe("DashboardPage", () => {
  beforeEach(() => {
    redirectMock.mockReset();
    requireAuthMock.mockReset();
    findManyMock.mockReset();

    requireAuthMock.mockResolvedValue({
      user: { id: "user-1" },
    });
  });

  it("redirects client-only users to their client dashboard", async () => {
    findManyMock.mockResolvedValue([
      { organizationId: "org-1", role: "CLIENT" },
    ]);
    redirectMock.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });

    await expect(DashboardPage()).rejects.toThrow(
      "REDIRECT:/dashboard/client/org-1",
    );
  });

  it("renders the developer dashboard for users with non-client access", async () => {
    findManyMock.mockResolvedValue([
      { organizationId: "org-1", role: "ADMIN" },
    ]);

    render(await DashboardPage());

    expect(screen.getByText("Developer dashboard")).toBeInTheDocument();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

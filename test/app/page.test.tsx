// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSessionMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({
  authOptions: {},
}));

import Home from "@/app/page";

describe("Home", () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
    redirectMock.mockReset();
  });

  it("shows the welcome screen and dashboard callback login link for guests", async () => {
    getServerSessionMock.mockResolvedValue(null);

    render(await Home());

    expect(
      screen.getByRole("heading", {
        name: /see the right dashboard the moment you sign in/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /sign in and open dashboard/i }),
    ).toHaveAttribute("href", "/api/auth/signin?callbackUrl=%2Fdashboard");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects authenticated users to the dashboard", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    redirectMock.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });

    await expect(Home()).rejects.toThrow("REDIRECT:/dashboard");
  });
});

// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const usePathnameMock = vi.hoisted(() => vi.fn());
const useSessionMock = vi.hoisted(() => vi.fn());
const signOutMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => useSessionMock(),
  signOut: signOutMock,
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

vi.mock("next/image", () => ({
  default: ({
    alt = "",
    src = "",
    ...props
  }: {
    alt?: string;
    src?: string;
  }) => <span aria-label={alt} data-src={src} {...props} />,
}));

import Sidebar from "@/app/components/layout/Sidebar";

afterEach(() => {
  cleanup();
});

const jsonResponse = (payload: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

describe("Sidebar", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
    useSessionMock.mockReset();
    signOutMock.mockReset();

    useSessionMock.mockReturnValue({
      data: {
        user: {
          name: "Shashank",
          email: "shashank@example.com",
          image: null,
        },
      },
    });
  });

  it("hides the global dashboard link for client-only users and routes the logo to client home", async () => {
    usePathnameMock.mockReturnValue("/dashboard/client/org-1");

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/organizations") {
        return jsonResponse([
          {
            id: "org-1",
            name: "Client Org",
            members: [{ role: "CLIENT" }],
          },
        ]);
      }

      if (url === "/api/client/org-1/dashboard") {
        return jsonResponse({
          projects: [{ id: "project-1", name: "Roadmap" }],
        });
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Sidebar />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "DevPilot" })).toHaveAttribute(
        "href",
        "/dashboard/client/org-1",
      );
    });

    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /roadmap/i })).toHaveAttribute(
        "href",
        "/dashboard/client/org-1#client-project-project-1",
      );
    });
  });

  it("keeps the global dashboard link for users with non-client access", async () => {
    usePathnameMock.mockReturnValue("/dashboard");

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/organizations") {
        return jsonResponse([
          {
            id: "org-1",
            name: "Platform Team",
            members: [{ role: "ADMIN" }],
          },
        ]);
      }

      if (url === "/api/organizations/org-1/projects") {
        return jsonResponse([]);
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Sidebar />);

    await waitFor(() => {
      expect(screen.getByText("Dashboard").closest("a")).toHaveAttribute(
        "href",
        "/dashboard",
      );
    });

    expect(screen.getByRole("link", { name: "DevPilot" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });
});

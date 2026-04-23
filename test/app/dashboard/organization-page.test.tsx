// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useParamsMock = vi.hoisted(() => vi.fn());
const pushMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useParams: () => useParamsMock(),
  useRouter: () => ({ push: pushMock }),
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

import OrgPage from "@/app/dashboard/organizations/[orgId]/page";

afterEach(() => {
  cleanup();
});

const jsonResponse = (payload: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );

describe("OrgPage", () => {
  beforeEach(() => {
    useParamsMock.mockReset();
    pushMock.mockReset();
    useParamsMock.mockReturnValue({ orgId: "org-1" });
  });

  it("renders the organization hero, project cards, and member tab content", async () => {
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
        return jsonResponse([
          {
            id: "project-1",
            name: "Roadmap",
            createdAt: "2026-04-20T10:00:00.000Z",
          },
        ]);
      }

      if (url === "/api/organizations/org-1/members") {
        return jsonResponse([
          {
            id: "member-1",
            role: "ADMIN",
            user: {
              id: "user-1",
              name: "Shashank",
              email: "shashank@example.com",
              image: null,
            },
          },
          {
            id: "member-2",
            role: "CLIENT",
            user: {
              id: "user-2",
              name: "Morgan Lee",
              email: "morgan@example.com",
              image: null,
            },
          },
        ]);
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<OrgPage />);

    expect(await screen.findByText("Organization hub")).toBeInTheDocument();
    expect(screen.getByText("Platform Team")).toBeInTheDocument();
    expect(screen.getByText("2 members")).toBeInTheDocument();
    expect(screen.getByText("1 client access")).toBeInTheDocument();
    expect(screen.getByText("Roadmap")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /members/i }));

    expect(await screen.findByText("Morgan Lee")).toBeInTheDocument();
    expect(screen.getByText("morgan@example.com")).toBeInTheDocument();
    expect(screen.getByText("CLIENT")).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/organizations");
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/organizations/org-1/projects",
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/organizations/org-1/members",
      );
    });
  });
});

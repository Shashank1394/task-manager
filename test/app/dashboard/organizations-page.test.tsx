// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

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

import OrganizationsPage from "@/app/dashboard/organizations/page";

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

describe("OrganizationsPage", () => {
  it("renders the organization hero and allows creating a new organization", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/organizations" && !init?.method) {
        return jsonResponse([
          {
            id: "org-1",
            name: "Platform Team",
            createdAt: "2026-04-20T10:00:00.000Z",
          },
        ]);
      }

      if (url === "/api/organizations" && init?.method === "POST") {
        return jsonResponse(
          {
            id: "org-2",
            name: "Investor Demo Lab",
            createdAt: "2026-04-23T11:00:00.000Z",
          },
          201,
        );
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<OrganizationsPage />);

    expect(await screen.findByText("Workspace structure")).toBeInTheDocument();
    expect(screen.getByText("Active spaces")).toBeInTheDocument();
    expect(screen.getByText("Platform Team")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /create/i }));
    await user.type(
      screen.getByPlaceholderText(/organization name/i),
      "Investor Demo Lab",
    );
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/organizations",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Investor Demo Lab" }),
        }),
      );
    });

    expect(await screen.findByText("Investor Demo Lab")).toBeInTheDocument();
  });
});

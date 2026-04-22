// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import NotificationBell from "@/app/components/NotificationBell";

afterEach(() => {
  cleanup();
});

describe("NotificationBell", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it("loads notifications and marks them all as read", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            notifications: [
              {
                id: "notif-1",
                type: "TASK_ASSIGNED",
                message: "New deadline",
                link: "/dashboard/project/project-1",
                read: false,
                createdAt: "2026-04-22T10:00:00.000Z",
              },
            ],
            unreadCount: 1,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<NotificationBell />);

    const bellButton = screen.getByTitle("Notifications");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/notifications");
    });

    await user.click(bellButton);

    const dropdown = await screen.findByText("Notifications");
    expect(dropdown).toBeInTheDocument();
    expect(screen.getByText("New deadline")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /mark all read/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/notifications",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all: true }),
        }),
      );
    });

    expect(
      screen.queryByRole("button", { name: /mark all read/i }),
    ).not.toBeInTheDocument();
    expect(within(bellButton).queryByText("1")).not.toBeInTheDocument();
  });

  it("marks a notification as read and navigates when clicked", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            notifications: [
              {
                id: "notif-1",
                type: "TASK_ASSIGNED",
                message: "Build activity feed",
                link: "/dashboard/project/project-1",
                read: false,
                createdAt: "2026-04-22T10:00:00.000Z",
              },
            ],
            unreadCount: 1,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<NotificationBell />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/notifications");
    });

    await user.click(screen.getByTitle("Notifications"));
    await user.click(
      await screen.findByRole("button", { name: /build activity feed/i }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/notifications",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ ids: ["notif-1"] }),
        }),
      );
    });

    expect(pushMock).toHaveBeenCalledWith("/dashboard/project/project-1");
  });
});

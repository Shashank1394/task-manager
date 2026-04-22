import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  account: {
    updateMany: vi.fn(),
  },
}));

const prismaAdapterMock = vi.hoisted(() => vi.fn(() => ({ name: "adapter" })));
const nextAuthMock = vi.hoisted(() =>
  vi.fn(() => {
    const handler = async () => new Response(null, { status: 200 });
    return handler;
  }),
);

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", async () => {
  const actual = await vi.importActual<typeof import("next-auth")>("next-auth");
  return {
    ...actual,
    default: nextAuthMock,
  };
});
vi.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: prismaAdapterMock,
}));

import { authOptions } from "@/app/api/auth/[...nextauth]/route";

describe("auth route", () => {
  beforeEach(() => {
    prismaMock.account.updateMany.mockReset();
  });

  it("configures Google and GitHub providers with jwt sessions", () => {
    const providerIds =
      authOptions.providers?.map((provider) => provider.id) ?? [];

    expect(authOptions.session?.strategy).toBe("jwt");
    expect(authOptions.adapter).toBeTruthy();
    expect(providerIds).toEqual(expect.arrayContaining(["google", "github"]));
  });

  it("stores fresh GitHub tokens on sign-in", async () => {
    await authOptions.callbacks?.signIn?.({
      user: undefined as never,
      account: {
        provider: "github",
        providerAccountId: "123",
        access_token: "token-1",
        refresh_token: "refresh-1",
        expires_at: 12345,
        scope: "repo",
        type: "oauth",
      } as never,
      profile: undefined as never,
      email: undefined as never,
      credentials: undefined as never,
    });

    expect(prismaMock.account.updateMany).toHaveBeenCalledWith({
      where: {
        provider: "github",
        providerAccountId: "123",
      },
      data: {
        access_token: "token-1",
        refresh_token: "refresh-1",
        expires_at: 12345,
        scope: "repo",
      },
    });
  });

  it("adds token.sub to the session user id", async () => {
    const session = await authOptions.callbacks?.session?.({
      session: {
        user: { name: "Shashank", email: "s@example.com" },
        expires: "2026-04-22T10:00:00.000Z",
      } as never,
      token: { sub: "user-1" } as never,
      user: undefined as never,
      trigger: "update" as never,
      newSession: undefined as never,
    });

    expect(session).toMatchObject({
      user: {
        id: "user-1",
      },
    });
  });
});

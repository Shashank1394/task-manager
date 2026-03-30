import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import crypto from "crypto";

/**
 * POST /api/projects/[projectId]/github-sync/setup-webhook
 * Registers a GitHub webhook on the connected repository.
 *
 * DELETE /api/projects/[projectId]/github-sync/setup-webhook
 * Removes the GitHub webhook from the repository.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const session = await requireAuth();

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        organization: { include: { members: true } },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Only admins can set up webhooks
    const member = project.organization.members.find(
      (m) => m.userId === session.user.id,
    );
    if (!member || member.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only admins can manage webhooks" },
        { status: 403 },
      );
    }

    if (
      !project.repoOwner ||
      !project.repoName ||
      project.repoProvider !== "GITHUB"
    ) {
      return NextResponse.json(
        { error: "GitHub repository not connected" },
        { status: 400 },
      );
    }

    // Check if webhook already exists
    if (project.webhookSecret && project.webhookId) {
      return NextResponse.json(
        { error: "Webhook already configured", webhookId: project.webhookId },
        { status: 409 },
      );
    }

    const githubAccount = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: "github" },
    });

    if (!githubAccount?.access_token) {
      return NextResponse.json(
        { error: "GitHub account not connected. Please sign in with GitHub." },
        { status: 400 },
      );
    }

    // Generate a cryptographically secure webhook secret
    const webhookSecret = crypto.randomBytes(32).toString("hex");

    // Determine the webhook URL
    const { webhookUrl } = (await req.json().catch(() => ({}))) as {
      webhookUrl?: string;
    };

    const callbackUrl = webhookUrl || `${getBaseUrl(req)}/api/webhooks/github`;

    // Register webhook on GitHub
    const ghRes = await fetch(
      `https://api.github.com/repos/${project.repoOwner}/${project.repoName}/hooks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubAccount.access_token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "web",
          active: true,
          events: ["issues", "pull_request", "push", "issue_comment"],
          config: {
            url: callbackUrl,
            content_type: "json",
            secret: webhookSecret,
            insecure_ssl: "0",
          },
        }),
      },
    );

    if (!ghRes.ok) {
      const error = await ghRes.text();
      const scopes = ghRes.headers.get("x-oauth-scopes") || "none";
      console.error(
        `Webhook creation failed: repo=${project.repoOwner}/${project.repoName}, status=${ghRes.status}, scopes=${scopes}`,
      );
      return NextResponse.json(
        {
          error: `GitHub API error: ${error}`,
          hint:
            ghRes.status === 404
              ? "Token may lack admin:repo_hook scope. Sign out and re-authenticate with GitHub."
              : undefined,
          scopes,
        },
        { status: 502 },
      );
    }

    const ghHook = (await ghRes.json()) as { id: number };

    // Save webhook secret and ID to project
    await prisma.project.update({
      where: { id: projectId },
      data: {
        webhookSecret,
        webhookId: ghHook.id,
      },
    });

    // Log the setup
    await prisma.gitHubSyncLog.create({
      data: {
        projectId,
        action: "WEBHOOK_SETUP",
        details: {
          webhookId: ghHook.id,
          events: ["issues", "pull_request", "push", "issue_comment"],
          url: callbackUrl,
        },
      },
    });

    return NextResponse.json({
      webhookId: ghHook.id,
      active: true,
      events: ["issues", "pull_request", "push", "issue_comment"],
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Webhook setup error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE — Remove webhook from GitHub and clear from project.
 */
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const session = await requireAuth();

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        organization: { include: { members: true } },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const member = project.organization.members.find(
      (m) => m.userId === session.user.id,
    );
    if (!member || member.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only admins can manage webhooks" },
        { status: 403 },
      );
    }

    if (
      !project.repoOwner ||
      !project.repoName ||
      project.repoProvider !== "GITHUB"
    ) {
      return NextResponse.json(
        { error: "GitHub repository not connected" },
        { status: 400 },
      );
    }

    if (!project.webhookId) {
      return NextResponse.json(
        { error: "No webhook configured" },
        { status: 404 },
      );
    }

    const githubAccount = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: "github" },
    });

    if (!githubAccount?.access_token) {
      return NextResponse.json(
        { error: "GitHub account not connected" },
        { status: 400 },
      );
    }

    // Delete webhook from GitHub
    const ghRes = await fetch(
      `https://api.github.com/repos/${project.repoOwner}/${project.repoName}/hooks/${project.webhookId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${githubAccount.access_token}`,
          Accept: "application/vnd.github+json",
        },
      },
    );

    // 204 = success, 404 = already gone — both are fine
    if (!ghRes.ok && ghRes.status !== 404) {
      const error = await ghRes.text();
      return NextResponse.json(
        { error: `GitHub API error: ${error}` },
        { status: 502 },
      );
    }

    // Clear from project
    await prisma.project.update({
      where: { id: projectId },
      data: {
        webhookSecret: null,
        webhookId: null,
      },
    });

    return NextResponse.json({ removed: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Webhook removal error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Derive base URL from the incoming request.
 */
function getBaseUrl(req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

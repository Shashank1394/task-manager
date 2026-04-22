import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import crypto from "crypto";
import { badRequest, handleRouteError, unauthorized } from "@/lib/api-errors";
import {
  requireGitHubAccessToken,
  requireGitHubProjectAccess,
} from "@/lib/github-route";
import { z } from "zod";

const setupWebhookSchema = z.object({
  webhookUrl: z.string().trim().url().optional(),
});

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

    const project = await requireGitHubProjectAccess(
      projectId,
      session.user.id,
      {
        adminOnly: true,
        requireConnectedRepo: true,
        adminMessage: "Only admins can manage webhooks",
      },
    );

    // Check if webhook already exists
    if (project.webhookSecret && project.webhookId) {
      return NextResponse.json(
        { error: "Webhook already configured", webhookId: project.webhookId },
        { status: 409 },
      );
    }

    const accessToken = await requireGitHubAccessToken(session.user.id);

    const rawBody = await req.text();
    const parsed = setupWebhookSchema.safeParse(
      rawBody ? JSON.parse(rawBody) : {},
    );
    if (!parsed.success) {
      throw badRequest("Invalid webhook setup payload", parsed.error.flatten());
    }

    // Generate a cryptographically secure webhook secret
    const webhookSecret = crypto.randomBytes(32).toString("hex");

    // Determine the webhook URL
    const callbackUrl =
      parsed.data.webhookUrl || `${getBaseUrl(req)}/api/webhooks/github`;

    // Register webhook on GitHub
    const ghRes = await fetch(
      `https://api.github.com/repos/${project.repoOwner}/${project.repoName}/hooks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
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
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
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

    const project = await requireGitHubProjectAccess(
      projectId,
      session.user.id,
      {
        adminOnly: true,
        requireConnectedRepo: true,
        adminMessage: "Only admins can manage webhooks",
      },
    );

    if (!project.webhookId) {
      return NextResponse.json(
        { error: "No webhook configured" },
        { status: 404 },
      );
    }

    const accessToken = await requireGitHubAccessToken(
      session.user.id,
      "GitHub account not connected",
    );

    // Delete webhook from GitHub
    const ghRes = await fetch(
      `https://api.github.com/repos/${project.repoOwner}/${project.repoName}/hooks/${project.webhookId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
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
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

/**
 * Derive base URL from the incoming request.
 */
function getBaseUrl(req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

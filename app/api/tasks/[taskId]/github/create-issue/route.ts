import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { handleRouteError, unauthorized } from "@/lib/api-errors";
import {
  requireGitHubAccessToken,
  requireGitHubTaskAccess,
} from "@/lib/github-route";

/**
 * POST /api/tasks/[taskId]/github/create-issue
 * Exports this task as a GitHub issue on the connected repository.
 */
export async function POST(
  _req: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await context.params;
    const session = await requireAuth();

    const task = await requireGitHubTaskAccess(taskId, session.user.id);
    const existingIssue = await prisma.gitHubIssue.findUnique({
      where: { taskId },
    });

    // Already has a linked issue
    if (existingIssue) {
      return NextResponse.json(
        {
          error: "Task already has a linked GitHub issue",
          issueUrl: task.githubIssueUrl,
        },
        { status: 409 },
      );
    }

    const project = task.board.project;
    const accessToken = await requireGitHubAccessToken(
      session.user.id,
      "GitHub account not connected",
    );

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    };

    // Build labels from priority
    const labels: string[] = [];
    if (task.priority === "HIGH") labels.push("priority: high");
    if (task.priority === "LOW") labels.push("priority: low");

    // Build issue body
    const body = [
      task.description ?? "",
      "",
      "---",
      `*Exported from Task Manager — TASK-${taskId}*`,
    ].join("\n");

    // Create issue on GitHub
    const ghRes = await fetch(
      `https://api.github.com/repos/${project.repoOwner}/${project.repoName}/issues`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: task.title,
          body,
          labels,
        }),
      },
    );

    if (!ghRes.ok) {
      const error = await ghRes.text();
      return NextResponse.json(
        { error: `GitHub API error: ${error}` },
        { status: 502 },
      );
    }

    const ghIssue = (await ghRes.json()) as {
      id: number;
      number: number;
      html_url: string;
    };

    // Create link record and update task
    await prisma.$transaction([
      prisma.gitHubIssue.create({
        data: {
          githubIssueId: BigInt(ghIssue.id),
          githubIssueNumber: ghIssue.number,
          syncDirection: "EXPORTED",
          taskId,
          projectId: project.id,
        },
      }),
      prisma.task.update({
        where: { id: taskId },
        data: { githubIssueUrl: ghIssue.html_url },
      }),
      prisma.gitHubSyncLog.create({
        data: {
          projectId: project.id,
          action: "ISSUE_EXPORTED",
          details: {
            taskId,
            issueNumber: ghIssue.number,
            url: ghIssue.html_url,
          },
        },
      }),
    ]);

    return NextResponse.json({
      issueNumber: ghIssue.number,
      url: ghIssue.html_url,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

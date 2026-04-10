import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";

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

    // Get task with project info
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        board: {
          project: {
            organization: {
              members: {
                some: {
                  userId: session.user.id,
                  role: { not: "CLIENT" },
                },
              },
            },
          },
        },
      },
      include: {
        board: {
          include: {
            project: true,
          },
        },
        githubIssue: true,
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Already has a linked issue
    if (task.githubIssue) {
      return NextResponse.json(
        {
          error: "Task already has a linked GitHub issue",
          issueUrl: task.githubIssueUrl,
        },
        { status: 409 },
      );
    }

    const project = task.board.project;

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

    const githubAccount = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: "github" },
    });

    if (!githubAccount?.access_token) {
      return NextResponse.json(
        { error: "GitHub account not connected" },
        { status: 400 },
      );
    }

    const headers = {
      Authorization: `Bearer ${githubAccount.access_token}`,
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
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Create issue error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

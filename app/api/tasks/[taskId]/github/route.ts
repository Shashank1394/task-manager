import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";

export async function GET(
  _req: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await context.params;
    await requireAuth();

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        githubIssueUrl: true,
        githubIssue: {
          select: {
            githubIssueNumber: true,
            syncDirection: true,
            lastSyncedAt: true,
          },
        },
        githubPRs: {
          select: {
            id: true,
            githubPrNumber: true,
            title: true,
            state: true,
            url: true,
            authorLogin: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
        githubCommits: {
          select: {
            id: true,
            sha: true,
            message: true,
            authorName: true,
            authorDate: true,
            url: true,
          },
          orderBy: { authorDate: "desc" },
        },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({
      issue: task.githubIssue
        ? {
            number: task.githubIssue.githubIssueNumber,
            url: task.githubIssueUrl,
            syncDirection: task.githubIssue.syncDirection,
            lastSyncedAt: task.githubIssue.lastSyncedAt,
          }
        : null,
      pullRequests: task.githubPRs,
      commits: task.githubCommits,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Task GitHub data error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

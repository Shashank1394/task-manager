import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import {
  forbidden,
  handleRouteError,
  notFound,
  unauthorized,
} from "@/lib/api-errors";

export async function GET(
  _req: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await context.params;
    const session = await requireAuth();

    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        board: {
          project: {
            organization: {
              members: { some: { userId: session.user.id } },
            },
          },
        },
      },
      select: {
        id: true,
        githubIssueUrl: true,
        board: {
          select: {
            project: {
              select: {
                id: true,
                organizationId: true,
              },
            },
          },
        },
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
      throw notFound("Task not found");
    }

    const membership = await prisma.organizationMember.findFirst({
      where: {
        organizationId: task.board.project.organizationId,
        userId: session.user.id,
      },
    });

    if (membership?.role === "CLIENT") {
      const clientAccess = await prisma.projectClient.findUnique({
        where: {
          userId_projectId: {
            userId: session.user.id,
            projectId: task.board.project.id,
          },
        },
      });

      if (!clientAccess) {
        throw forbidden("Forbidden");
      }
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
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

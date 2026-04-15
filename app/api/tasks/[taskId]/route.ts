import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { TaskStatus, TaskPriority } from "@prisma/client";

/** Shared auth check — returns task or null. Blocks CLIENT role. */
async function authorizeTask(taskId: string, userId: string) {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      board: {
        project: {
          organization: {
            members: {
              some: {
                userId,
                role: { not: "CLIENT" },
              },
            },
          },
        },
      },
    },
  });
  return task;
}

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
      include: {
        assignee: {
          select: { id: true, name: true, email: true, image: true },
        },
        board: {
          select: {
            project: {
              select: { id: true, organizationId: true },
            },
          },
        },
        comments: {
          orderBy: { createdAt: "asc" },
          include: {
            user: { select: { id: true, name: true, image: true } },
          },
        },
        labels: { orderBy: { name: "asc" } },
        subtasks: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // If CLIENT, verify ProjectClient access
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
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    return NextResponse.json(task);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await context.params;
    const session = await requireAuth();

    const task = await authorizeTask(taskId, session.user.id);
    if (!task) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.status !== undefined) data.status = body.status as TaskStatus;
    if (body.priority !== undefined)
      data.priority = body.priority as TaskPriority;
    if (body.assigneeId !== undefined)
      data.assigneeId = body.assigneeId || null;
    if (body.dueDate !== undefined)
      data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.sprintId !== undefined) data.sprintId = body.sprintId || null;

    const updated = await prisma.task.update({
      where: { id: taskId },
      data,
      include: {
        assignee: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    // Auto-close/reopen linked GitHub issue when status changes
    if (body.status !== undefined) {
      await syncGitHubIssueState(taskId, body.status, session.user.id);
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await context.params;
    const session = await requireAuth();

    const task = await authorizeTask(taskId, session.user.id);
    if (!task) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.task.delete({ where: { id: taskId } });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/**
 * When a task's status changes, update the linked GitHub issue state.
 * DONE → close issue, TODO/IN_PROGRESS → reopen issue.
 * Runs as fire-and-forget (errors are logged, not surfaced to the user).
 */
async function syncGitHubIssueState(
  taskId: string,
  newStatus: string,
  userId: string,
) {
  try {
    const ghIssue = await prisma.gitHubIssue.findUnique({
      where: { taskId },
      include: {
        project: true,
      },
    });

    if (!ghIssue || !ghIssue.project.repoOwner || !ghIssue.project.repoName) {
      return;
    }

    const githubAccount = await prisma.account.findFirst({
      where: { userId, provider: "github" },
    });

    if (!githubAccount?.access_token) return;

    const ghState = newStatus === "DONE" ? "closed" : "open";

    await fetch(
      `https://api.github.com/repos/${ghIssue.project.repoOwner}/${ghIssue.project.repoName}/issues/${ghIssue.githubIssueNumber}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${githubAccount.access_token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ state: ghState }),
      },
    );
  } catch (error) {
    console.error("Failed to sync GitHub issue state:", error);
  }
}

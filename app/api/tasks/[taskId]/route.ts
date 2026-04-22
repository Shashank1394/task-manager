import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { TaskStatus, TaskPriority } from "@prisma/client";
import { logActivity, notify } from "@/lib/activity";
import {
  badRequest,
  forbidden,
  handleRouteError,
  notFound,
  unauthorized,
} from "@/lib/api-errors";
import { z } from "zod";

const patchTaskSchema = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().max(10000).nullable().optional(),
    status: z.enum(TaskStatus).optional(),
    priority: z.enum(TaskPriority).optional(),
    assigneeId: z.string().trim().min(1).nullable().optional(),
    dueDate: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .optional()
      .refine(
        (value) => value == null || !Number.isNaN(new Date(value).getTime()),
        "Invalid dueDate",
      ),
    sprintId: z.string().trim().min(1).nullable().optional(),
    estimatedHours: z.coerce.number().min(0).nullable().optional(),
    loggedHours: z.coerce.number().min(0).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Request body must include at least one updatable field",
  });

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
    select: {
      id: true,
      title: true,
      status: true,
      assigneeId: true,
      board: {
        select: {
          project: {
            select: {
              organizationId: true,
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
      throw notFound("Task not found");
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
        throw forbidden("Forbidden");
      }
    }

    return NextResponse.json(task);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
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
      throw forbidden("Forbidden");
    }

    const parsed = patchTaskSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw badRequest("Invalid task update payload", parsed.error.flatten());
    }

    const body = parsed.data;
    const data: Record<string, unknown> = {};

    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.status !== undefined) data.status = body.status;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.assigneeId !== undefined)
      data.assigneeId = body.assigneeId || null;
    if (body.dueDate !== undefined)
      data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.sprintId !== undefined) data.sprintId = body.sprintId || null;
    if (body.estimatedHours !== undefined)
      data.estimatedHours =
        body.estimatedHours !== null ? Number(body.estimatedHours) : null;
    if (body.loggedHours !== undefined)
      data.loggedHours = Math.max(0, Number(body.loggedHours) || 0);

    if (
      body.assigneeId !== undefined &&
      body.assigneeId !== task.assigneeId &&
      body.assigneeId
    ) {
      const eligibleAssignee = await prisma.organizationMember.findFirst({
        where: {
          organizationId: task.board.project.organizationId,
          userId: body.assigneeId,
          role: { not: "CLIENT" },
        },
        select: { id: true },
      });

      if (!eligibleAssignee) {
        throw badRequest("Tasks can only be assigned to team members");
      }
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data,
      include: {
        assignee: {
          select: { id: true, name: true, email: true, image: true },
        },
        board: {
          select: { projectId: true },
        },
      },
    });

    const projectId = updated.board.projectId;

    // Log activity for status changes
    if (body.status !== undefined && body.status !== task.status) {
      logActivity({
        type: "TASK_MOVED",
        message: `moved "${updated.title}" from ${task.status.replace("_", " ")} to ${body.status.replace("_", " ")}`,
        userId: session.user.id,
        projectId,
        taskId,
        meta: { from: task.status, to: body.status },
      });
    }

    // Log + notify for assignment changes
    if (body.assigneeId !== undefined && body.assigneeId !== task.assigneeId) {
      if (body.assigneeId) {
        logActivity({
          type: "TASK_ASSIGNED",
          message: `assigned "${updated.title}" to ${updated.assignee?.name ?? "someone"}`,
          userId: session.user.id,
          projectId,
          taskId,
        });
        if (body.assigneeId !== session.user.id) {
          notify(
            body.assigneeId,
            "TASK_ASSIGNED",
            `You were assigned to "${updated.title}"`,
            `/dashboard/project/${projectId}`,
          );
        }
      }
    }

    // Auto-close/reopen linked GitHub issue when status changes
    if (body.status !== undefined) {
      await syncGitHubIssueState(taskId, body.status, session.user.id);
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
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
      throw forbidden("Forbidden");
    }

    // Get project info before deleting
    const taskWithBoard = await prisma.task.findUnique({
      where: { id: taskId },
      select: { title: true, board: { select: { projectId: true } } },
    });

    await prisma.task.delete({ where: { id: taskId } });

    if (taskWithBoard) {
      logActivity({
        type: "TASK_DELETED",
        message: `deleted "${taskWithBoard.title}"`,
        userId: session.user.id,
        projectId: taskWithBoard.board.projectId,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
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

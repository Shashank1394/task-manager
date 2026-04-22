import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { TaskStatus, TaskPriority } from "@prisma/client";
import { logActivity } from "@/lib/activity";
import {
  badRequest,
  forbidden,
  handleRouteError,
  unauthorized,
} from "@/lib/api-errors";
import { z } from "zod";

const createTaskSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().max(10000).nullable().optional(),
  priority: z.enum(TaskPriority).optional(),
  status: z.enum(TaskStatus).optional(),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ boardId: string }> },
) {
  try {
    const { boardId } = await context.params;
    const session = await requireAuth();

    const parsed = createTaskSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw badRequest("Invalid task payload", parsed.error.flatten());
    }

    const { title, description, priority, status } = parsed.data;

    // Verify board access via project → org membership (exclude clients)
    const board = await prisma.board.findFirst({
      where: {
        id: boardId,
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
    });

    if (!board) {
      throw forbidden("Forbidden");
    }

    const task = await prisma.task.create({
      data: {
        title,
        description: description ?? null,
        priority: priority ?? TaskPriority.MEDIUM,
        status: status ?? TaskStatus.TODO,
        boardId,
      },
    });

    const created = await prisma.task.findUnique({
      where: { id: task.id },
      include: {
        assignee: {
          select: { id: true, name: true, email: true, image: true },
        },
        labels: {
          select: { id: true, name: true, color: true },
          orderBy: { name: "asc" },
        },
        sprint: { select: { id: true, name: true, status: true } },
        _count: { select: { comments: true } },
      },
    });

    logActivity({
      type: "TASK_CREATED",
      message: `created "${title}"`,
      userId: session.user.id,
      projectId: board.projectId,
      taskId: task.id,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ boardId: string }> },
) {
  try {
    const { boardId } = await context.params;
    const session = await requireAuth();

    const board = await prisma.board.findFirst({
      where: {
        id: boardId,
        project: {
          organization: {
            members: {
              some: { userId: session.user.id },
            },
          },
        },
      },
    });

    if (!board) {
      throw forbidden("Forbidden");
    }

    const tasks = await prisma.task.findMany({
      where: { boardId },
      orderBy: { createdAt: "asc" },
      include: {
        assignee: {
          select: { id: true, name: true, email: true, image: true },
        },
        labels: {
          select: { id: true, name: true, color: true },
          orderBy: { name: "asc" },
        },
        sprint: { select: { id: true, name: true, status: true } },
        _count: { select: { comments: true } },
      },
    });

    return NextResponse.json(tasks);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

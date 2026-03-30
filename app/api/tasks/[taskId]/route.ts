import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { TaskStatus, TaskPriority } from "@prisma/client";

/** Shared auth check — returns task or error response */
async function authorizeTask(taskId: string, userId: string) {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      board: {
        project: {
          organization: {
            members: { some: { userId } },
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
              select: { organizationId: true },
            },
          },
        },
        comments: {
          orderBy: { createdAt: "asc" },
          include: {
            user: { select: { id: true, name: true, image: true } },
          },
        },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
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

    const updated = await prisma.task.update({
      where: { id: taskId },
      data,
      include: {
        assignee: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

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

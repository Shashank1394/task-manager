import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";

async function authorizeTaskAccess(taskId: string, userId: string) {
  return prisma.task.findFirst({
    where: {
      id: taskId,
      board: {
        project: {
          organization: {
            members: {
              some: { userId, role: { not: "CLIENT" } },
            },
          },
        },
      },
    },
  });
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await context.params;
    const session = await requireAuth();

    const task = await authorizeTaskAccess(taskId, session.user.id);
    if (!task) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const subtasks = await prisma.subtask.findMany({
      where: { taskId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(subtasks);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await context.params;
    const session = await requireAuth();

    const task = await authorizeTaskAccess(taskId, session.user.id);
    if (!task) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { title } = await req.json();
    if (!title || title.trim().length < 1) {
      return NextResponse.json(
        { error: "Subtask title is required" },
        { status: 400 },
      );
    }

    const subtask = await prisma.subtask.create({
      data: { title: title.trim(), taskId },
    });

    return NextResponse.json(subtask, { status: 201 });
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

    const task = await authorizeTaskAccess(taskId, session.user.id);
    if (!task) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { subtaskId, done, title } = await req.json();
    if (!subtaskId) {
      return NextResponse.json(
        { error: "subtaskId is required" },
        { status: 400 },
      );
    }

    const data: Record<string, unknown> = {};
    if (done !== undefined) data.done = done;
    if (title !== undefined) data.title = title;

    const updated = await prisma.subtask.update({
      where: { id: subtaskId },
      data,
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await context.params;
    const session = await requireAuth();

    const task = await authorizeTaskAccess(taskId, session.user.id);
    if (!task) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { subtaskId } = await req.json();
    if (!subtaskId) {
      return NextResponse.json(
        { error: "subtaskId is required" },
        { status: 400 },
      );
    }

    await prisma.subtask.delete({ where: { id: subtaskId } });

    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

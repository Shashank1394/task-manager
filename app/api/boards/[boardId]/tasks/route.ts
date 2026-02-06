import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { TaskStatus, TaskPriority } from "@prisma/client";

export async function POST(
  req: Request,
  context: { params: Promise<{ boardId: string }> },
) {
  const { boardId } = await context.params;
  const session = await requireAuth();

  const { title, description, priority } = await req.json();

  if (!title || title.trim().length < 3) {
    return NextResponse.json(
      { error: "Task title is required" },
      { status: 400 },
    );
  }

  // Verify board access via project → org membership
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
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const task = await prisma.task.create({
    data: {
      title,
      description,
      priority: priority ?? TaskPriority.MEDIUM,
      status: TaskStatus.TODO,
      boardId,
    },
  });

  return NextResponse.json(task, { status: 201 });
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ boardId: string }> },
) {
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
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tasks = await prisma.task.findMany({
    where: { boardId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(tasks);
}

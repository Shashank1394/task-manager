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

    const labels = await prisma.label.findMany({
      where: { taskId },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(labels);
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

    const { name, color } = await req.json();
    if (!name || name.trim().length < 1) {
      return NextResponse.json(
        { error: "Label name is required" },
        { status: 400 },
      );
    }

    const label = await prisma.label.create({
      data: {
        name: name.trim(),
        color: color || "#6366f1",
        taskId,
      },
    });

    return NextResponse.json(label, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "Label already exists on this task" },
        { status: 409 },
      );
    }
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

    const { labelId } = await req.json();
    if (!labelId) {
      return NextResponse.json(
        { error: "labelId is required" },
        { status: 400 },
      );
    }

    await prisma.label.delete({ where: { id: labelId } });

    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

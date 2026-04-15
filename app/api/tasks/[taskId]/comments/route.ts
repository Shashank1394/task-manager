import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { logActivity } from "@/lib/activity";

export async function GET(
  _req: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await context.params;
    const session = await requireAuth();

    // Verify access
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
    });

    if (!task) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const comments = await prisma.comment.findMany({
      where: { taskId },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    });

    return NextResponse.json(comments);
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

    const { content } = await req.json();

    if (!content || content.trim().length === 0) {
      return NextResponse.json(
        { error: "Comment cannot be empty" },
        { status: 400 },
      );
    }

    // Verify access (block clients from posting comments)
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
    });

    if (!task) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        taskId,
        userId: session.user.id,
      },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    });

    // Log activity — need projectId from task's board
    const taskWithBoard = await prisma.task.findUnique({
      where: { id: taskId },
      select: { title: true, board: { select: { projectId: true } } },
    });
    if (taskWithBoard) {
      logActivity({
        type: "COMMENT_ADDED",
        message: `commented on "${taskWithBoard.title}"`,
        userId: session.user.id,
        projectId: taskWithBoard.board.projectId,
        taskId,
      });
    }

    return NextResponse.json(comment, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { logActivity } from "@/lib/activity";
import {
  badRequest,
  forbidden,
  handleRouteError,
  notFound,
  unauthorized,
} from "@/lib/api-errors";
import { z } from "zod";

const createCommentSchema = z.object({
  content: z.string().trim().min(1).max(5000),
});

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
      throw notFound("Task not found");
    }

    const comments = await prisma.comment.findMany({
      where: { taskId },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    });

    return NextResponse.json(comments);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await context.params;
    const session = await requireAuth();

    const parsed = createCommentSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw badRequest("Invalid comment payload", parsed.error.flatten());
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
      select: {
        title: true,
        board: { select: { projectId: true } },
      },
    });

    if (!task) {
      throw forbidden("Forbidden");
    }

    const comment = await prisma.comment.create({
      data: {
        content: parsed.data.content,
        taskId,
        userId: session.user.id,
      },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    });

    logActivity({
      type: "COMMENT_ADDED",
      message: `commented on "${task.title}"`,
      userId: session.user.id,
      projectId: task.board.projectId,
      taskId,
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

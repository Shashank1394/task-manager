import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import {
  badRequest,
  forbidden,
  handleRouteError,
  notFound,
  unauthorized,
} from "@/lib/api-errors";
import { z } from "zod";

const createSubtaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

const updateSubtaskSchema = z
  .object({
    subtaskId: z.string().trim().min(1),
    done: z.boolean().optional(),
    title: z.string().trim().min(1).max(200).optional(),
  })
  .refine((data) => Object.keys(data).some((key) => key !== "subtaskId"), {
    message: "At least one subtask field must be updated",
  });

const deleteSubtaskSchema = z.object({
  subtaskId: z.string().trim().min(1),
});

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
      throw forbidden("Forbidden");
    }

    const subtasks = await prisma.subtask.findMany({
      where: { taskId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(subtasks);
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

    const task = await authorizeTaskAccess(taskId, session.user.id);
    if (!task) {
      throw forbidden("Forbidden");
    }

    const parsed = createSubtaskSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw badRequest("Invalid subtask payload", parsed.error.flatten());
    }

    const subtask = await prisma.subtask.create({
      data: { title: parsed.data.title, taskId },
    });

    return NextResponse.json(subtask, { status: 201 });
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

    const task = await authorizeTaskAccess(taskId, session.user.id);
    if (!task) {
      throw forbidden("Forbidden");
    }

    const parsed = updateSubtaskSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw badRequest(
        "Invalid subtask update payload",
        parsed.error.flatten(),
      );
    }

    const { subtaskId, done, title } = parsed.data;

    const subtask = await prisma.subtask.findFirst({
      where: { id: subtaskId, taskId },
      select: { id: true },
    });

    if (!subtask) {
      throw notFound("Subtask not found");
    }

    const data: Record<string, unknown> = {};
    if (done !== undefined) data.done = done;
    if (title !== undefined) data.title = title;

    const updated = await prisma.subtask.update({
      where: { id: subtaskId },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
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
      throw forbidden("Forbidden");
    }

    const parsed = deleteSubtaskSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw badRequest(
        "Invalid subtask delete payload",
        parsed.error.flatten(),
      );
    }

    const deleted = await prisma.subtask.deleteMany({
      where: { id: parsed.data.subtaskId, taskId },
    });

    if (deleted.count === 0) {
      throw notFound("Subtask not found");
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

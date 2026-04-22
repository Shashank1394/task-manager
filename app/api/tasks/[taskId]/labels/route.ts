import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { Prisma } from "@prisma/client";
import {
  badRequest,
  conflict,
  forbidden,
  handleRouteError,
  notFound,
  unauthorized,
} from "@/lib/api-errors";
import { z } from "zod";

const createLabelSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z
    .string()
    .trim()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Invalid color")
    .optional(),
});

const deleteLabelSchema = z.object({
  labelId: z.string().trim().min(1),
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

    const labels = await prisma.label.findMany({
      where: { taskId },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(labels);
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

    const parsed = createLabelSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw badRequest("Invalid label payload", parsed.error.flatten());
    }

    const { name, color } = parsed.data;

    const label = await prisma.label.create({
      data: {
        name,
        color: color || "#6366f1",
        taskId,
      },
    });

    return NextResponse.json(label, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return handleRouteError(conflict("Label already exists on this task"));
    }
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

    const parsed = deleteLabelSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw badRequest("Invalid label delete payload", parsed.error.flatten());
    }

    const deleted = await prisma.label.deleteMany({
      where: { id: parsed.data.labelId, taskId },
    });

    if (deleted.count === 0) {
      throw notFound("Label not found");
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

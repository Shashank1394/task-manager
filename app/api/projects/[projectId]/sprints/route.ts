import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { SprintStatus } from "@prisma/client";
import {
  badRequest,
  forbidden,
  handleRouteError,
  notFound,
  unauthorized,
} from "@/lib/api-errors";
import { z } from "zod";

const nullableDateField = z
  .string()
  .trim()
  .min(1)
  .nullable()
  .optional()
  .refine(
    (value) => value == null || !Number.isNaN(new Date(value).getTime()),
    "Invalid date",
  );

const createSprintSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    goal: z.string().trim().max(2000).nullable().optional(),
    startDate: nullableDateField,
    endDate: nullableDateField,
  })
  .refine(
    (data) =>
      !data.startDate ||
      !data.endDate ||
      new Date(data.endDate) >= new Date(data.startDate),
    {
      message: "endDate must be on or after startDate",
      path: ["endDate"],
    },
  );

const updateSprintSchema = z
  .object({
    sprintId: z.string().trim().min(1),
    name: z.string().trim().min(1).max(120).optional(),
    goal: z.string().trim().max(2000).nullable().optional(),
    status: z.enum(SprintStatus).optional(),
    startDate: nullableDateField,
    endDate: nullableDateField,
  })
  .refine((data) => Object.keys(data).some((key) => key !== "sprintId"), {
    message: "At least one sprint field must be updated",
  })
  .refine(
    (data) =>
      !data.startDate ||
      !data.endDate ||
      new Date(data.endDate) >= new Date(data.startDate),
    {
      message: "endDate must be on or after startDate",
      path: ["endDate"],
    },
  );

async function authorizeProject(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      organization: { include: { members: true } },
    },
  });

  if (!project) return null;

  const membership = project.organization.members.find(
    (m) => m.userId === userId && m.role !== "CLIENT",
  );

  return membership ? project : null;
}

// GET — list sprints for a project
export async function GET(
  _req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const session = await requireAuth();

    const project = await authorizeProject(projectId, session.user.id);
    if (!project) {
      throw forbidden("Forbidden");
    }

    const sprints = await prisma.sprint.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { tasks: true } },
      },
    });

    return NextResponse.json(sprints);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

// POST — create a new sprint
export async function POST(
  req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const session = await requireAuth();

    const project = await authorizeProject(projectId, session.user.id);
    if (!project) {
      throw forbidden("Forbidden");
    }

    const parsed = createSprintSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw badRequest("Invalid sprint payload", parsed.error.flatten());
    }

    const { name, goal, startDate, endDate } = parsed.data;

    const sprint = await prisma.sprint.create({
      data: {
        name,
        goal: goal || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        projectId,
      },
      include: {
        _count: { select: { tasks: true } },
      },
    });

    return NextResponse.json(sprint, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

// PATCH — update a sprint (by sprintId in body)
export async function PATCH(
  req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const session = await requireAuth();

    const project = await authorizeProject(projectId, session.user.id);
    if (!project) {
      throw forbidden("Forbidden");
    }

    const parsed = updateSprintSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw badRequest("Invalid sprint update payload", parsed.error.flatten());
    }

    const { sprintId, name, goal, status, startDate, endDate } = parsed.data;

    const sprint = await prisma.sprint.findFirst({
      where: { id: sprintId, projectId },
    });

    if (!sprint) {
      throw notFound("Sprint not found");
    }

    // If activating a sprint, complete any currently active sprint
    if (status === "ACTIVE" && sprint.status !== "ACTIVE") {
      await prisma.sprint.updateMany({
        where: { projectId, status: "ACTIVE" },
        data: { status: "COMPLETED" },
      });
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (goal !== undefined) data.goal = goal || null;
    if (status !== undefined) data.status = status;
    if (startDate !== undefined)
      data.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined)
      data.endDate = endDate ? new Date(endDate) : null;

    const updated = await prisma.sprint.update({
      where: { id: sprintId },
      data,
      include: {
        _count: { select: { tasks: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

// DELETE — delete a sprint (unlinks tasks, doesn't delete them)
export async function DELETE(
  req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const session = await requireAuth();

    const project = await authorizeProject(projectId, session.user.id);
    if (!project) {
      throw forbidden("Forbidden");
    }

    const { searchParams } = new URL(req.url);
    const sprintId = searchParams.get("sprintId");

    if (!sprintId) {
      throw badRequest("sprintId is required");
    }

    const sprint = await prisma.sprint.findFirst({
      where: { id: sprintId, projectId },
    });

    if (!sprint) {
      throw notFound("Sprint not found");
    }

    // Unlink tasks, then delete sprint
    await prisma.task.updateMany({
      where: { sprintId },
      data: { sprintId: null },
    });

    await prisma.sprint.delete({ where: { id: sprintId } });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

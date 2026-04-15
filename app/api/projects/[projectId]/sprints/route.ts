import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { SprintStatus } from "@prisma/client";

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
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    console.error("GET /sprints error:", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { name, goal, startDate, endDate } = body;

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Sprint name is required" },
        { status: 400 },
      );
    }

    const sprint = await prisma.sprint.create({
      data: {
        name: name.trim(),
        goal: goal?.trim() || null,
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
    console.error("POST /sprints error:", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { sprintId, name, goal, status, startDate, endDate } = body;

    if (!sprintId) {
      return NextResponse.json(
        { error: "sprintId is required" },
        { status: 400 },
      );
    }

    const sprint = await prisma.sprint.findFirst({
      where: { id: sprintId, projectId },
    });

    if (!sprint) {
      return NextResponse.json({ error: "Sprint not found" }, { status: 404 });
    }

    // If activating a sprint, complete any currently active sprint
    if (status === "ACTIVE" && sprint.status !== "ACTIVE") {
      await prisma.sprint.updateMany({
        where: { projectId, status: "ACTIVE" },
        data: { status: "COMPLETED" },
      });
    }

    const data: Record<string, unknown> = {};
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (typeof goal === "string") data.goal = goal.trim() || null;
    if (status !== undefined) data.status = status as SprintStatus;
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
    console.error("PATCH /sprints error:", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const sprintId = searchParams.get("sprintId");

    if (!sprintId) {
      return NextResponse.json(
        { error: "sprintId is required" },
        { status: 400 },
      );
    }

    const sprint = await prisma.sprint.findFirst({
      where: { id: sprintId, projectId },
    });

    if (!sprint) {
      return NextResponse.json({ error: "Sprint not found" }, { status: 404 });
    }

    // Unlink tasks, then delete sprint
    await prisma.task.updateMany({
      where: { sprintId },
      data: { sprintId: null },
    });

    await prisma.sprint.delete({ where: { id: sprintId } });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("DELETE /sprints error:", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

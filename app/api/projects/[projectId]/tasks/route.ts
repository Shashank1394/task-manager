import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, checkClientProjectAccess } from "@/lib/auth-server";
import { handleRouteError, unauthorized } from "@/lib/api-errors";

export async function GET(
  _req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const session = await requireAuth();

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        board: true,
        organization: {
          include: { members: true },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const { allowed } = await checkClientProjectAccess(
      session.user.id,
      projectId,
      project.organizationId,
    );

    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!project.board) {
      return NextResponse.json([]);
    }

    const tasks = await prisma.task.findMany({
      where: { boardId: project.board.id },
      orderBy: { createdAt: "asc" },
      include: {
        assignee: {
          select: { id: true, name: true, email: true, image: true },
        },
        labels: {
          select: { id: true, name: true, color: true },
          orderBy: { name: "asc" },
        },
        sprint: {
          select: { id: true, name: true, status: true },
        },
        _count: { select: { comments: true } },
      },
    });

    return NextResponse.json(tasks);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";

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

    const isMember = project.organization.members.some(
      (m) => m.userId === session.user.id,
    );

    if (!isMember) {
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
        _count: { select: { comments: true } },
      },
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

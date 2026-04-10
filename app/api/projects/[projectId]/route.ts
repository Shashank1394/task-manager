import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { Role } from "@prisma/client";

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
        board: { select: { id: true } },
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
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: project.id,
      name: project.name,
      description: project.description,
      organizationId: project.organizationId,
      board: project.board,
      webhookActive: !!project.webhookId,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

// DELETE — delete project and all its data (admin only)
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const session = await requireAuth();

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        organization: {
          include: { members: true },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const membership = project.organization.members.find(
      (m) => m.userId === session.user.id,
    );

    if (!membership || membership.role !== Role.ADMIN) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

    await prisma.$transaction(async (tx) => {
      const boards = await tx.board.findMany({
        where: { projectId },
        select: { id: true },
      });
      const boardIds = boards.map((b) => b.id);

      if (boardIds.length > 0) {
        const tasks = await tx.task.findMany({
          where: { boardId: { in: boardIds } },
          select: { id: true },
        });
        const taskIds = tasks.map((t) => t.id);

        if (taskIds.length > 0) {
          await tx.comment.deleteMany({ where: { taskId: { in: taskIds } } });
          await tx.task.deleteMany({ where: { id: { in: taskIds } } });
        }

        await tx.board.deleteMany({ where: { id: { in: boardIds } } });
      }

      await tx.gitHubIssue.deleteMany({ where: { projectId } });
      await tx.gitHubPR.deleteMany({ where: { projectId } });
      await tx.gitHubCommit.deleteMany({ where: { projectId } });
      await tx.gitHubSyncLog.deleteMany({ where: { projectId } });

      await tx.project.delete({ where: { id: projectId } });
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { Role } from "@prisma/client";

// PATCH — rename organization (admin only)
export async function PATCH(
  req: Request,
  context: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await context.params;

  try {
    const session = await requireAuth();
    const { name } = await req.json();

    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: orgId, userId: session.user.id },
    });

    if (!membership || membership.role !== Role.ADMIN) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

    if (!name || name.trim().length < 3) {
      return NextResponse.json(
        { error: "Name must be at least 3 characters" },
        { status: 400 },
      );
    }

    const updated = await prisma.organization.update({
      where: { id: orgId },
      data: { name: name.trim() },
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

// DELETE — delete organization and all data (admin only)
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await context.params;

  try {
    const session = await requireAuth();

    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: orgId, userId: session.user.id },
    });

    if (!membership || membership.role !== Role.ADMIN) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

    // Delete in order: tasks/boards/projects under this org, then members, then org
    await prisma.$transaction(async (tx) => {
      // Get all project IDs
      const projects = await tx.project.findMany({
        where: { organizationId: orgId },
        select: { id: true },
      });
      const projectIds = projects.map((p) => p.id);

      if (projectIds.length > 0) {
        // Get all board IDs
        const boards = await tx.board.findMany({
          where: { projectId: { in: projectIds } },
          select: { id: true },
        });
        const boardIds = boards.map((b) => b.id);

        if (boardIds.length > 0) {
          // Get all task IDs
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

        // Delete GitHub-related data
        await tx.gitHubIssue.deleteMany({
          where: { projectId: { in: projectIds } },
        });
        await tx.gitHubPR.deleteMany({
          where: { projectId: { in: projectIds } },
        });
        await tx.gitHubCommit.deleteMany({
          where: { projectId: { in: projectIds } },
        });
        await tx.gitHubSyncLog.deleteMany({
          where: { projectId: { in: projectIds } },
        });

        await tx.project.deleteMany({ where: { organizationId: orgId } });
      }

      await tx.organizationMember.deleteMany({
        where: { organizationId: orgId },
      });
      await tx.organization.delete({ where: { id: orgId } });
    });

    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

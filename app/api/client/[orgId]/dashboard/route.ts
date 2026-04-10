import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";

/**
 * GET /api/client/[orgId]/dashboard
 * Returns project progress data visible to CLIENT role members.
 * Shows only high-level stats — no task details, no member info.
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId } = await context.params;
    const session = await requireAuth();

    // Verify the user is a member of this org (any role including CLIENT)
    const membership = await prisma.organizationMember.findFirst({
      where: {
        organizationId: orgId,
        userId: session.user.id,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true },
    });

    if (!org) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // If user is a CLIENT, only show projects they're explicitly assigned to
    const isClient = membership.role === "CLIENT";

    let projectFilter: { organizationId: string; id?: { in: string[] } } = {
      organizationId: orgId,
    };

    if (isClient) {
      const clientProjects = await prisma.projectClient.findMany({
        where: { userId: session.user.id, project: { organizationId: orgId } },
        select: { projectId: true },
      });
      const allowedIds = clientProjects.map((cp) => cp.projectId);
      projectFilter = { organizationId: orgId, id: { in: allowedIds } };
    }

    // Fetch projects with task stats
    const projects = await prisma.project.findMany({
      where: projectFilter,
      include: {
        board: {
          include: {
            tasks: {
              select: { status: true, priority: true },
            },
          },
        },
      },
    });

    const projectSummaries = projects.map((p) => {
      const tasks = p.board?.tasks ?? [];
      const total = tasks.length;
      const done = tasks.filter((t) => t.status === "DONE").length;
      const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
      const todo = tasks.filter((t) => t.status === "TODO").length;
      const completionPct = total > 0 ? Math.round((done / total) * 100) : 0;

      return {
        id: p.id,
        name: p.name,
        total,
        todo,
        inProgress,
        done,
        completionPct,
      };
    });

    // Aggregate totals
    const totalTasks = projectSummaries.reduce((s, p) => s + p.total, 0);
    const totalDone = projectSummaries.reduce((s, p) => s + p.done, 0);
    const totalInProgress = projectSummaries.reduce(
      (s, p) => s + p.inProgress,
      0,
    );
    const totalTodo = projectSummaries.reduce((s, p) => s + p.todo, 0);
    const overallCompletion =
      totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;

    return NextResponse.json({
      organization: org,
      overview: {
        totalTasks,
        totalDone,
        totalInProgress,
        totalTodo,
        overallCompletion,
        projectCount: projects.length,
      },
      projects: projectSummaries,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

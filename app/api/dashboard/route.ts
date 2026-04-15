import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";

/**
 * GET /api/dashboard
 * Returns aggregated data for the current user's dashboard.
 */
export async function GET() {
  try {
    const session = await requireAuth();
    const userId = session.user.id;

    // Get user's orgs (exclude orgs where user is CLIENT — they have their own dashboard)
    const memberships = await prisma.organizationMember.findMany({
      where: { userId, role: { not: "CLIENT" } },
      include: {
        organization: {
          include: {
            projects: {
              include: {
                board: {
                  include: {
                    tasks: {
                      select: {
                        id: true,
                        title: true,
                        status: true,
                        priority: true,
                        assigneeId: true,
                        createdAt: true,
                        estimatedHours: true,
                        loggedHours: true,
                        board: {
                          select: {
                            project: {
                              select: { id: true, name: true },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Flatten all tasks across all projects
    const allTasks = memberships.flatMap((m) =>
      m.organization.projects.flatMap((p) => p.board?.tasks ?? []),
    );

    // My tasks (assigned to me)
    const myTasks = allTasks
      .filter((t) => t.assigneeId === userId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

    // Stats
    const totalTasks = allTasks.length;
    const byStatus = {
      TODO: allTasks.filter((t) => t.status === "TODO").length,
      IN_PROGRESS: allTasks.filter((t) => t.status === "IN_PROGRESS").length,
      DONE: allTasks.filter((t) => t.status === "DONE").length,
    };
    const byPriority = {
      HIGH: allTasks.filter((t) => t.priority === "HIGH").length,
      MEDIUM: allTasks.filter((t) => t.priority === "MEDIUM").length,
      LOW: allTasks.filter((t) => t.priority === "LOW").length,
    };

    // Project summaries
    const projectSummaries = memberships.flatMap((m) =>
      m.organization.projects.map((p) => {
        const tasks = p.board?.tasks ?? [];
        const done = tasks.filter((t) => t.status === "DONE").length;
        const estimated = tasks.reduce(
          (sum, t) => sum + (t.estimatedHours ?? 0),
          0,
        );
        const logged = tasks.reduce((sum, t) => sum + t.loggedHours, 0);
        return {
          id: p.id,
          name: p.name,
          orgName: m.organization.name,
          totalTasks: tasks.length,
          completedTasks: done,
          completionPct:
            tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0,
          estimatedHours: Math.round(estimated * 10) / 10,
          loggedHours: Math.round(logged * 10) / 10,
        };
      }),
    );

    // My assigned tasks (limited to non-DONE, top 10)
    const myActiveTasks = myTasks
      .filter((t) => t.status !== "DONE")
      .slice(0, 10)
      .map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        projectName: t.board.project.name,
        projectId: t.board.project.id,
        estimatedHours: t.estimatedHours,
        loggedHours: t.loggedHours,
      }));

    // Recent completed (top 5)
    const recentCompleted = allTasks
      .filter((t) => t.status === "DONE")
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 5)
      .map((t) => ({
        id: t.id,
        title: t.title,
        projectName: t.board.project.name,
      }));

    // Time tracking totals
    const totalEstimated = allTasks.reduce(
      (sum, t) => sum + (t.estimatedHours ?? 0),
      0,
    );
    const totalLogged = allTasks.reduce((sum, t) => sum + t.loggedHours, 0);

    return NextResponse.json({
      totalTasks,
      byStatus,
      byPriority,
      myActiveTasks,
      recentCompleted,
      projectSummaries,
      orgCount: memberships.length,
      timeTracking: {
        totalEstimated: Math.round(totalEstimated * 10) / 10,
        totalLogged: Math.round(totalLogged * 10) / 10,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Dashboard error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

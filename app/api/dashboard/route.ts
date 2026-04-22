import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { handleRouteError } from "@/lib/api-errors";

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
                        dueDate: true,
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
        dueDate: t.dueDate,
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

    // Overdue & due-soon tasks
    const now = new Date();
    const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const openTasks = allTasks.filter((t) => t.status !== "DONE" && t.dueDate);
    const overdueTasks = openTasks
      .filter((t) => new Date(t.dueDate!) < now)
      .map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        status: t.status,
        priority: t.priority,
        projectName: t.board.project.name,
        projectId: t.board.project.id,
      }));
    const dueSoonTasks = openTasks
      .filter((t) => {
        const d = new Date(t.dueDate!);
        return d >= now && d <= sevenDaysOut;
      })
      .sort(
        (a, b) =>
          new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime(),
      )
      .slice(0, 5)
      .map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        status: t.status,
        priority: t.priority,
        projectName: t.board.project.name,
        projectId: t.board.project.id,
      }));

    // Active sprints
    const activeSprints = await prisma.sprint.findMany({
      where: {
        status: "ACTIVE",
        project: {
          organization: {
            members: { some: { userId, role: { not: "CLIENT" } } },
          },
        },
      },
      select: {
        id: true,
        name: true,
        endDate: true,
        project: { select: { id: true, name: true } },
        tasks: {
          select: { status: true },
        },
      },
      take: 3,
    });

    const sprintSummaries = activeSprints.map((s) => ({
      id: s.id,
      name: s.name,
      endDate: s.endDate,
      projectName: s.project.name,
      projectId: s.project.id,
      totalTasks: s.tasks.length,
      completedTasks: s.tasks.filter((t) => t.status === "DONE").length,
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
      overdueTasks,
      dueSoonTasks,
      activeSprints: sprintSummaries,
      timeTracking: {
        totalEstimated: Math.round(totalEstimated * 10) / 10,
        totalLogged: Math.round(totalLogged * 10) / 10,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { handleRouteError, notFound, unauthorized } from "@/lib/api-errors";
import {
  maybeGenerateDigestWithModel,
  maybeGenerateEtaReportWithModel,
  type EtaReport,
} from "@/lib/ai-digest";

type DigestTask = {
  id: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  dueDate: Date | null;
  assigneeId: string | null;
  sprintId: string | null;
  estimatedHours: number | null;
  loggedHours: number;
  createdAt: Date;
};

type DigestSprint = {
  id: string;
  name: string;
  status: "PLANNING" | "ACTIVE" | "COMPLETED";
  goal: string | null;
  startDate: Date | null;
  endDate: Date | null;
};

type DigestActivity = {
  message: string;
  createdAt: Date;
};

function pluralize(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_IN_MS);
}

function buildRuleEtaReport(project: {
  name: string;
  sprints: DigestSprint[];
  board: { tasks: DigestTask[] } | null;
}) {
  const tasks = project.board?.tasks ?? [];
  const now = new Date();
  const doneCount = tasks.filter((task) => task.status === "DONE").length;
  const inProgressCount = tasks.filter(
    (task) => task.status === "IN_PROGRESS",
  ).length;
  const todoCount = tasks.filter((task) => task.status === "TODO").length;
  const openCount = tasks.length - doneCount;
  const overdueCount = tasks.filter(
    (task) =>
      task.status !== "DONE" &&
      task.dueDate &&
      task.dueDate.getTime() < now.getTime(),
  ).length;
  const unassignedCount = tasks.filter(
    (task) => task.status !== "DONE" && !task.assigneeId,
  ).length;
  const totalEstimatedHours = tasks.reduce(
    (sum, task) => sum + (task.estimatedHours ?? 0),
    0,
  );
  const totalLoggedHours = tasks.reduce(
    (sum, task) => sum + task.loggedHours,
    0,
  );
  const activeSprint =
    project.sprints.find((sprint) => sprint.status === "ACTIVE") ?? null;

  if (tasks.length === 0) {
    return {
      projectedCompletionDate: null,
      confidence: "LOW" as const,
      summary:
        "There is not enough scoped work on the board yet to produce a credible completion forecast.",
      assumptions: [
        "Add more scoped tasks before relying on a delivery date.",
        "Set sprint dates or task estimates to improve the forecast.",
      ],
    } satisfies EtaReport;
  }

  if (openCount === 0) {
    return {
      projectedCompletionDate: now.toISOString(),
      confidence: "HIGH" as const,
      summary: `${project.name} is effectively complete because every currently tracked task is already done.`,
      assumptions: [
        "No additional scope is added after this forecast.",
        "Completion reflects the tasks currently tracked on the board.",
      ],
    } satisfies EtaReport;
  }

  let projectedCompletionDate: Date;
  let confidence: EtaReport["confidence"];
  let assumptions: string[];

  if (activeSprint?.endDate) {
    let projected = new Date(activeSprint.endDate);

    if (projected.getTime() < now.getTime()) {
      projected = addDays(now, 7);
    }

    let slipDays = 0;
    if (overdueCount > 0) {
      slipDays += 6;
    }
    if (unassignedCount > 0) {
      slipDays += 4;
    }
    if (todoCount > doneCount + inProgressCount) {
      slipDays += 5;
    }

    projectedCompletionDate = addDays(projected, slipDays);
    confidence = slipDays === 0 && inProgressCount > 0 ? "HIGH" : "MEDIUM";
    assumptions = [
      `${activeSprint.name} remains the main delivery window for the current scope.`,
      overdueCount > 0
        ? "Overdue work is closed without adding more than one extra sprint of scope."
        : "No new overdue work appears before the current sprint closes.",
      unassignedCount > 0
        ? "Unowned tasks get assigned quickly enough to avoid another schedule slip."
        : "Current ownership stays stable through completion.",
    ];
  } else if (doneCount > 0) {
    const oldestTaskCreatedAt = tasks.reduce(
      (earliest, task) =>
        task.createdAt.getTime() < earliest.getTime()
          ? task.createdAt
          : earliest,
      tasks[0]!.createdAt,
    );
    const observedDays = Math.max(
      7,
      Math.ceil((now.getTime() - oldestTaskCreatedAt.getTime()) / DAY_IN_MS),
    );
    const weeklyThroughput = doneCount / Math.max(observedDays / 7, 1);
    const weeksRemaining = openCount / Math.max(weeklyThroughput, 0.25);

    projectedCompletionDate = addDays(now, Math.ceil(weeksRemaining * 7));
    confidence = doneCount >= 3 ? "MEDIUM" : "LOW";
    assumptions = [
      "Recent completion pace remains steady over the next few weeks.",
      "Open scope stays close to what is currently on the board.",
      overdueCount > 0
        ? "Overdue work does not expand into a larger rework cycle."
        : "Work continues moving forward without a new blockage spike.",
    ];
  } else if (totalEstimatedHours > 0) {
    const remainingHours = Math.max(
      totalEstimatedHours - totalLoggedHours,
      openCount * 4,
    );

    projectedCompletionDate = addDays(now, Math.ceil(remainingHours / 6));
    confidence = "LOW";
    assumptions = [
      "Remaining estimates are directionally accurate.",
      "Logged hours continue to grow at roughly the current rate.",
      "No major scope change lands after this forecast.",
    ];
  } else {
    projectedCompletionDate = addDays(now, Math.max(7, openCount * 4));
    confidence = "LOW";
    assumptions = [
      "The board does not yet have enough planning data for a higher-confidence date.",
      "Task count is being used as a rough proxy for remaining effort.",
      "New work is not added faster than current work is closed.",
    ];
  }

  return {
    projectedCompletionDate: projectedCompletionDate.toISOString(),
    confidence,
    summary: `${project.name} is currently tracking toward ${projectedCompletionDate.toLocaleDateString(
      "en-US",
      {
        month: "short",
        day: "numeric",
        year: "numeric",
      },
    )} with ${confidence.toLowerCase()} confidence based on ${doneCount}/${tasks.length} tasks complete and ${openCount} still open.`,
    assumptions: assumptions.slice(0, 3),
  } satisfies EtaReport;
}

function buildRuleDigest(project: {
  name: string;
  clients: { id: string }[];
  sprints: DigestSprint[];
  activities: DigestActivity[];
  board: { tasks: DigestTask[] } | null;
}) {
  const tasks = project.board?.tasks ?? [];
  const now = Date.now();
  const doneCount = tasks.filter((task) => task.status === "DONE").length;
  const inProgressCount = tasks.filter(
    (task) => task.status === "IN_PROGRESS",
  ).length;
  const todoCount = tasks.filter((task) => task.status === "TODO").length;
  const openTasks = tasks.filter((task) => task.status !== "DONE");
  const overdueTasks = openTasks.filter(
    (task) => task.dueDate && task.dueDate.getTime() < now,
  );
  const unassignedOpenTasks = openTasks.filter((task) => !task.assigneeId);
  const activeSprint =
    project.sprints.find((sprint) => sprint.status === "ACTIVE") ?? null;
  const scopedTasks = activeSprint
    ? tasks.filter((task) => task.sprintId === activeSprint.id)
    : [];
  const scopedDoneCount = scopedTasks.filter(
    (task) => task.status === "DONE",
  ).length;
  const scopedInProgressCount = scopedTasks.filter(
    (task) => task.status === "IN_PROGRESS",
  ).length;
  const scopedTodoCount = scopedTasks.filter(
    (task) => task.status === "TODO",
  ).length;
  const recentActivity = project.activities[0] ?? null;

  const summary =
    activeSprint && scopedTasks.length > 0
      ? `${project.name} is running ${activeSprint.name} with ${pluralize(scopedDoneCount, "scoped task")} done, ${pluralize(scopedInProgressCount, "task")} in progress, and ${pluralize(scopedTodoCount, "task")} still queued.`
      : `${project.name} currently has ${pluralize(doneCount, "task")} complete, ${pluralize(inProgressCount, "task")} in progress, and ${pluralize(todoCount, "task")} still open.`;

  const highlights = [
    activeSprint
      ? `${activeSprint.name} is the active sprint with ${pluralize(scopedTasks.length, "task")} scoped.`
      : "No active sprint is set yet, so work is still being managed directly from the board.",
    recentActivity
      ? `Latest delivery signal: ${recentActivity.message}`
      : "No recent activity has been logged for this project yet.",
    project.clients.length > 0
      ? `${pluralize(project.clients.length, "client stakeholder")} currently have access to this project.`
      : "No client stakeholders are currently attached to this project.",
  ];

  const risks = [
    ...(overdueTasks.length > 0
      ? [
          `${pluralize(overdueTasks.length, "overdue task")} ${overdueTasks.length === 1 ? "needs" : "need"} attention before the schedule slips further.`,
        ]
      : []),
    ...(unassignedOpenTasks.length > 0
      ? [
          `${pluralize(unassignedOpenTasks.length, "open task")} still ${unassignedOpenTasks.length === 1 ? "does not have" : "do not have"} an owner.`,
        ]
      : []),
    ...(activeSprint &&
    scopedTodoCount > scopedDoneCount + scopedInProgressCount
      ? [
          `Most scoped sprint work has not started yet, which could put ${activeSprint.name} behind pace.`,
        ]
      : []),
  ];

  if (risks.length === 0) {
    risks.push(
      "No immediate delivery risks stand out from the current board signals.",
    );
  }

  const nextSteps = [
    ...(overdueTasks.length > 0
      ? [
          `Re-sequence or unblock ${overdueTasks[0]!.title} and confirm who is driving it.`,
        ]
      : []),
    ...(unassignedOpenTasks.length > 0
      ? ["Assign owners to the remaining open work so accountability is clear."]
      : []),
    ...(activeSprint && scopedTodoCount > 0
      ? [
          "Pull the next ready sprint task into progress to keep delivery moving.",
        ]
      : []),
  ];

  if (nextSteps.length === 0) {
    nextSteps.push(
      "Keep logging delivery activity so the next brief can call out trend changes earlier.",
    );
  }

  return {
    source: "rules" as const,
    generatedAt: new Date().toISOString(),
    summary,
    highlights,
    risks,
    nextSteps,
    snapshot: {
      totalTasks: tasks.length,
      doneTasks: doneCount,
      inProgressTasks: inProgressCount,
      todoTasks: todoCount,
      overdueTasks: overdueTasks.length,
      unassignedOpenTasks: unassignedOpenTasks.length,
      clientCount: project.clients.length,
      activeSprintName: activeSprint?.name ?? null,
    },
  };
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const session = await requireAuth();

    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organization: {
          members: { some: { userId: session.user.id } },
        },
      },
      select: {
        description: true,
        name: true,
        clients: { select: { id: true } },
        sprints: {
          select: {
            id: true,
            name: true,
            status: true,
            goal: true,
            startDate: true,
            endDate: true,
          },
          orderBy: { createdAt: "desc" },
        },
        activities: {
          select: { message: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 3,
        },
        board: {
          select: {
            tasks: {
              select: {
                id: true,
                title: true,
                status: true,
                dueDate: true,
                assigneeId: true,
                sprintId: true,
                estimatedHours: true,
                loggedHours: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!project) {
      throw notFound("Not found");
    }

    const fallback = buildRuleDigest(project);
    const fallbackEta = buildRuleEtaReport(project);
    const activeSprint =
      project.sprints.find((sprint) => sprint.status === "ACTIVE") ?? null;

    const digest = await maybeGenerateDigestWithModel({
      audience: "internal product and delivery team",
      fallback,
      voice:
        "an engineering operations analyst writing short, decisive internal delivery briefs",
      instructions: [
        "Call out overdue task names directly when they appear in context.",
        "Mention ownership gaps when unassigned work is present.",
        "If a sprint is active, anchor the brief around that sprint instead of speaking abstractly.",
      ],
      context: {
        projectName: project.name,
        projectDescription: project.description,
        snapshot: fallback.snapshot,
        activeSprint,
        recentActivities: project.activities.map(
          (activity) => activity.message,
        ),
        overdueTasks: (project.board?.tasks ?? [])
          .filter(
            (task) =>
              task.status !== "DONE" &&
              task.dueDate &&
              task.dueDate.getTime() < Date.now(),
          )
          .map((task) => task.title)
          .slice(0, 3),
        unassignedOpenTasks: (project.board?.tasks ?? [])
          .filter((task) => task.status !== "DONE" && !task.assigneeId)
          .map((task) => task.title)
          .slice(0, 3),
      },
    });

    const etaReport = await maybeGenerateEtaReportWithModel({
      fallback: fallbackEta,
      voice:
        "a delivery forecasting analyst writing concise, evidence-based project ETA reports",
      instructions: [
        "Reference the active sprint or current project scope when it strengthens the forecast.",
        "Keep the summary candid about uncertainty when overdue or unassigned work weakens the date.",
        "Use assumptions to explain what has to stay true for the forecast to hold.",
      ],
      context: {
        projectName: project.name,
        projectDescription: project.description,
        activeSprint,
        workload: {
          ...fallback.snapshot,
          totalEstimatedHours: (project.board?.tasks ?? []).reduce(
            (sum, task) => sum + (task.estimatedHours ?? 0),
            0,
          ),
          totalLoggedHours: (project.board?.tasks ?? []).reduce(
            (sum, task) => sum + task.loggedHours,
            0,
          ),
        },
        recentActivities: project.activities.map(
          (activity) => activity.message,
        ),
        fallbackEta,
      },
    });

    return NextResponse.json({
      ...digest,
      etaReport,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

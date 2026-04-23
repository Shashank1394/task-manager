import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import {
  forbidden,
  handleRouteError,
  notFound,
  unauthorized,
} from "@/lib/api-errors";
import {
  maybeGenerateDigestWithModel,
  maybeGenerateEtaReportWithModel,
  type EtaReport,
} from "@/lib/ai-digest";

type ClientProjectSummary = {
  id: string;
  name: string;
  total: number;
  todo: number;
  inProgress: number;
  done: number;
  completionPct: number;
};

function pluralize(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_IN_MS);
}

function buildClientRuleDigest(payload: {
  organizationName: string;
  projects: ClientProjectSummary[];
}) {
  const totalTasks = payload.projects.reduce(
    (sum, project) => sum + project.total,
    0,
  );
  const totalDone = payload.projects.reduce(
    (sum, project) => sum + project.done,
    0,
  );
  const totalInProgress = payload.projects.reduce(
    (sum, project) => sum + project.inProgress,
    0,
  );
  const totalTodo = payload.projects.reduce(
    (sum, project) => sum + project.todo,
    0,
  );
  const overallCompletion =
    totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;
  const highestCompletionProject =
    [...payload.projects].sort(
      (left, right) => right.completionPct - left.completionPct,
    )[0] ?? null;
  const mostActiveProject =
    [...payload.projects].sort(
      (left, right) => right.inProgress - left.inProgress,
    )[0] ?? null;

  const summary =
    payload.projects.length > 0
      ? `${payload.organizationName} currently has ${pluralize(payload.projects.length, "project")} in view with ${overallCompletion}% of tracked work completed overall.`
      : `${payload.organizationName} does not have any client-visible projects to summarize yet.`;

  const highlights = [
    payload.projects.length > 0
      ? `${pluralize(totalDone, "task")} ${totalDone === 1 ? "is" : "are"} complete across the visible portfolio.`
      : "No active project work is visible yet.",
    highestCompletionProject
      ? `${highestCompletionProject.name} is the furthest along at ${highestCompletionProject.completionPct}% complete.`
      : "No project completion trend is available yet.",
    mostActiveProject && mostActiveProject.inProgress > 0
      ? `${mostActiveProject.name} currently has the most active delivery work underway.`
      : "No project currently shows active in-progress work.",
  ];

  const risks = [
    ...(totalTodo > totalDone + totalInProgress
      ? [
          "Most visible work is still queued, so the delivery picture may move slowly until more tasks enter progress.",
        ]
      : []),
    ...(payload.projects.some(
      (project) => project.total > 0 && project.done === 0,
    )
      ? [
          "At least one visible project has not shipped any completed tasks yet.",
        ]
      : []),
  ];

  if (risks.length === 0) {
    risks.push(
      "No major delivery concerns stand out from the current client-visible progress snapshot.",
    );
  }

  const nextSteps = [
    ...(mostActiveProject && mostActiveProject.inProgress > 0
      ? [
          `Track ${mostActiveProject.name} for the next concrete delivery update.`,
        ]
      : []),
    ...(highestCompletionProject
      ? [
          `Use ${highestCompletionProject.name} as the clearest proof point in the next client update.`,
        ]
      : []),
  ];

  if (nextSteps.length === 0) {
    nextSteps.push(
      "Check back after more task progress is recorded to generate a stronger client brief.",
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
      projectCount: payload.projects.length,
      totalTasks,
      totalDone,
      totalInProgress,
      totalTodo,
      overallCompletion,
    },
  };
}

function buildClientEtaReport(payload: {
  organizationName: string;
  projects: ClientProjectSummary[];
}) {
  const totalTasks = payload.projects.reduce(
    (sum, project) => sum + project.total,
    0,
  );
  const totalDone = payload.projects.reduce(
    (sum, project) => sum + project.done,
    0,
  );
  const totalInProgress = payload.projects.reduce(
    (sum, project) => sum + project.inProgress,
    0,
  );
  const totalTodo = payload.projects.reduce(
    (sum, project) => sum + project.todo,
    0,
  );
  const overallCompletion =
    totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;
  const openTasks = totalTasks - totalDone;
  const today = new Date();

  if (payload.projects.length === 0 || totalTasks === 0) {
    return {
      projectedCompletionDate: null,
      confidence: "LOW" as const,
      summary:
        "There is not enough visible delivery progress yet to forecast a reliable completion window.",
      assumptions: [
        "More tracked progress needs to appear before a stronger forecast is possible.",
        "The visible portfolio may change as additional work is shared.",
      ],
    } satisfies EtaReport;
  }

  if (openTasks === 0) {
    return {
      projectedCompletionDate: today.toISOString(),
      confidence: "HIGH" as const,
      summary: `${payload.organizationName} has already completed the currently visible scope.`,
      assumptions: [
        "No additional client-visible scope is added after this report.",
        "Completion reflects the work currently visible in the dashboard.",
      ],
    } satisfies EtaReport;
  }

  let daysRemaining = 21;
  if (overallCompletion >= 75) {
    daysRemaining = 7;
  } else if (overallCompletion >= 50) {
    daysRemaining = 12;
  } else if (totalInProgress > 0) {
    daysRemaining = 16;
  }

  if (totalTodo > totalDone + totalInProgress) {
    daysRemaining += 6;
  }

  const projectedCompletionDate = addDays(today, daysRemaining);
  const confidence =
    totalDone > 0 && totalInProgress > 0
      ? ("MEDIUM" as const)
      : ("LOW" as const);

  return {
    projectedCompletionDate: projectedCompletionDate.toISOString(),
    confidence,
    summary: `${payload.organizationName} is currently trending toward ${projectedCompletionDate.toLocaleDateString(
      "en-US",
      {
        month: "short",
        day: "numeric",
        year: "numeric",
      },
    )} based on the visible completion trend across ${pluralize(payload.projects.length, "project")}.`,
    assumptions: [
      "Current progress continues at roughly the same pace.",
      "The visible scope stays close to what is currently shown in the dashboard.",
      totalTodo > totalDone + totalInProgress
        ? "Queued work starts moving into progress soon enough to keep the forecast intact."
        : "Work already in progress continues to close without major interruption.",
    ],
  } satisfies EtaReport;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId } = await context.params;
    const session = await requireAuth();

    const membership = await prisma.organizationMember.findFirst({
      where: {
        organizationId: orgId,
        userId: session.user.id,
      },
    });

    if (!membership) {
      throw forbidden("Forbidden");
    }

    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true },
    });

    if (!organization) {
      throw notFound("Not found");
    }

    let projectFilter: { organizationId: string; id?: { in: string[] } } = {
      organizationId: orgId,
    };

    if (membership.role === "CLIENT") {
      const allowedProjects = await prisma.projectClient.findMany({
        where: { userId: session.user.id, project: { organizationId: orgId } },
        select: { projectId: true },
      });

      projectFilter = {
        organizationId: orgId,
        id: { in: allowedProjects.map((project) => project.projectId) },
      };
    }

    const projects = await prisma.project.findMany({
      where: projectFilter,
      include: {
        board: {
          include: {
            tasks: {
              select: { status: true },
            },
          },
        },
      },
    });

    const summaries: ClientProjectSummary[] = projects.map((project) => {
      const tasks = project.board?.tasks ?? [];
      const total = tasks.length;
      const done = tasks.filter((task) => task.status === "DONE").length;
      const inProgress = tasks.filter(
        (task) => task.status === "IN_PROGRESS",
      ).length;
      const todo = tasks.filter((task) => task.status === "TODO").length;

      return {
        id: project.id,
        name: project.name,
        total,
        todo,
        inProgress,
        done,
        completionPct: total > 0 ? Math.round((done / total) * 100) : 0,
      };
    });

    const fallback = buildClientRuleDigest({
      organizationName: organization.name,
      projects: summaries,
    });
    const fallbackEta = buildClientEtaReport({
      organizationName: organization.name,
      projects: summaries,
    });

    const digest = await maybeGenerateDigestWithModel({
      audience: "client stakeholder",
      fallback,
      voice: "a delivery lead writing calm, external-facing client updates",
      instructions: [
        "Use visible project names and completion percentages as proof points.",
        "Keep the language externally shareable and delivery-oriented.",
        "Do not mention staffing, ownership gaps, or hidden internal blockers.",
      ],
      context: {
        organizationName: organization.name,
        snapshot: fallback.snapshot,
        projects: summaries.map((project) => ({
          name: project.name,
          completionPct: project.completionPct,
          total: project.total,
          done: project.done,
          inProgress: project.inProgress,
          todo: project.todo,
        })),
        constraints: [
          "Keep the wording client-safe and delivery-oriented.",
          "Do not mention internal staffing, ownership gaps, or any hidden member details.",
        ],
      },
    });

    const etaReport = await maybeGenerateEtaReportWithModel({
      fallback: fallbackEta,
      voice: "a calm delivery partner writing client-safe completion outlooks",
      instructions: [
        "Keep the tone measured and externally shareable.",
        "Avoid language that sounds like a guarantee or internal escalation.",
        "Frame assumptions around visible scope and current progress, not internal staffing.",
      ],
      context: {
        organizationName: organization.name,
        portfolioSnapshot: fallback.snapshot,
        projects: summaries.map((project) => ({
          name: project.name,
          completionPct: project.completionPct,
          total: project.total,
          done: project.done,
          inProgress: project.inProgress,
          todo: project.todo,
        })),
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

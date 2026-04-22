import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, forbidden, notFound } from "@/lib/api-errors";

type GitHubProjectAccessOptions = {
  adminOnly?: boolean;
  requireConnectedRepo?: boolean;
  requireBoard?: boolean;
  adminMessage?: string;
  memberMessage?: string;
  repoMessage?: string;
};

export type GitHubProjectAccess = Prisma.ProjectGetPayload<{
  include: {
    organization: { include: { members: true } };
    board: true;
  };
}>;

export type GitHubTaskAccess = Prisma.TaskGetPayload<{
  include: {
    board: { include: { project: true } };
  };
}>;

export async function requireGitHubProjectAccess(
  projectId: string,
  userId: string,
  options: GitHubProjectAccessOptions = {},
): Promise<GitHubProjectAccess> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      organization: { include: { members: true } },
      board: true,
    },
  });

  if (!project) {
    throw notFound("Project not found");
  }

  const member = project.organization.members.find((m) => m.userId === userId);

  if (!member || member.role === "CLIENT") {
    throw forbidden(options.memberMessage ?? "Forbidden");
  }

  if (options.adminOnly && member.role !== "ADMIN") {
    throw forbidden(
      options.adminMessage ?? "Only admins can manage GitHub integration",
    );
  }

  if (
    options.requireConnectedRepo &&
    (!project.repoOwner ||
      !project.repoName ||
      project.repoProvider !== "GITHUB")
  ) {
    throw badRequest(options.repoMessage ?? "GitHub repository not connected");
  }

  if (options.requireBoard && !project.board) {
    throw badRequest("Project has no board");
  }

  return project;
}

export async function requireGitHubTaskAccess(
  taskId: string,
  userId: string,
): Promise<GitHubTaskAccess> {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      board: {
        project: {
          organization: {
            members: {
              some: {
                userId,
                role: { not: "CLIENT" },
              },
            },
          },
        },
      },
    },
    include: {
      board: {
        include: {
          project: true,
        },
      },
    },
  });

  if (!task) {
    throw notFound("Task not found");
  }

  const project = task.board.project;
  if (
    !project.repoOwner ||
    !project.repoName ||
    project.repoProvider !== "GITHUB"
  ) {
    throw badRequest("GitHub repository not connected");
  }

  return task;
}

export async function requireGitHubAccessToken(
  userId: string,
  message = "GitHub account not connected. Please sign in with GitHub.",
) {
  const githubAccount = await prisma.account.findFirst({
    where: { userId, provider: "github" },
  });

  if (!githubAccount?.access_token) {
    throw badRequest(message);
  }

  return githubAccount.access_token;
}

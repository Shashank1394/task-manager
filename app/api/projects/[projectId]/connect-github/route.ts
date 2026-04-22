import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { badRequest, handleRouteError, unauthorized } from "@/lib/api-errors";
import {
  requireGitHubAccessToken,
  requireGitHubProjectAccess,
} from "@/lib/github-route";
import { z } from "zod";

const connectGitHubSchema = z.object({
  repoOwner: z.string().trim().min(1).max(100),
  repoName: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .transform((value) => value.replace(/\.git$/, "")),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const session = await requireAuth();

    const parsed = connectGitHubSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw badRequest(
        "Invalid GitHub connection payload",
        parsed.error.flatten(),
      );
    }

    const { repoOwner, repoName } = parsed.data;

    await requireGitHubProjectAccess(projectId, session.user.id);
    await requireGitHubAccessToken(session.user.id, "GitHub not connected");

    // Attach repo to project
    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: {
        repoProvider: "GITHUB",
        repoOwner,
        repoName,
      },
    });

    return NextResponse.json(updatedProject);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

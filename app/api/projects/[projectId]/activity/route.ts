import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { handleRouteError, notFound, unauthorized } from "@/lib/api-errors";

/**
 * GET /api/projects/[projectId]/activity
 * Returns recent activity for a project.
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const session = await requireAuth();

    // Verify membership
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organization: {
          members: { some: { userId: session.user.id } },
        },
      },
    });

    if (!project) {
      throw notFound("Not found");
    }

    const url = new URL(req.url);
    const take = Math.min(Number(url.searchParams.get("limit") || 30), 100);

    const activities = await prisma.activity.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take,
      include: {
        user: { select: { id: true, name: true, image: true } },
        task: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json(activities);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";

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
        organization: { include: { members: true } },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const isMember = project.organization.members.some(
      (m) => m.userId === session.user.id && m.role !== "CLIENT",
    );
    if (!isMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const syncedCount = await prisma.gitHubIssue.count({
      where: { projectId },
    });

    const lastSync = await prisma.gitHubSyncLog.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      syncedIssues: syncedCount,
      lastSyncedAt: lastSync?.createdAt ?? null,
      lastAction: lastSync?.action ?? null,
      lastDetails: lastSync?.details ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Sync status error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

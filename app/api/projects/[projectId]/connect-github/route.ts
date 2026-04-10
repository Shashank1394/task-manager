import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";

export async function POST(
  req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const session = await requireAuth();

    const { repoOwner, repoName } = await req.json();

    if (!repoOwner || !repoName) {
      return NextResponse.json(
        { error: "Repository owner and name are required" },
        { status: 400 },
      );
    }

    // Find project + org
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        organization: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check org membership (exclude clients)
    const isMember = project.organization.members.some(
      (m) => m.userId === session.user.id && m.role !== "CLIENT",
    );

    if (!isMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check GitHub connected
    const githubAccount = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: "github",
      },
    });

    if (!githubAccount) {
      return NextResponse.json(
        { error: "GitHub not connected" },
        { status: 400 },
      );
    }

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
    console.error(error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

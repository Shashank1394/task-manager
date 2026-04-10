import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";

/**
 * GET /api/projects/[projectId]/clients
 * List clients assigned to this project.
 * Only org admins/members can view.
 */
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
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const membership = project.organization.members.find(
      (m) => m.userId === session.user.id,
    );

    if (!membership || membership.role === "CLIENT") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const clients = await prisma.projectClient.findMany({
      where: { projectId },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(clients);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/**
 * POST /api/projects/[projectId]/clients
 * Invite a client to this project by email.
 * Only org admins can add clients.
 * Automatically adds them as CLIENT to the org if not already a member.
 */
export async function POST(
  req: Request,
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
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const membership = project.organization.members.find(
      (m) => m.userId === session.user.id,
    );

    if (!membership || membership.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only admins can invite clients" },
        { status: 403 },
      );
    }

    const { email } = (await req.json()) as { email?: string };

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json(
        { error: "No user found with that email. They must sign up first." },
        { status: 404 },
      );
    }

    // Check if already a project client
    const existing = await prisma.projectClient.findUnique({
      where: {
        userId_projectId: { userId: user.id, projectId },
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: "User is already a client of this project" },
        { status: 409 },
      );
    }

    // Ensure user is an org member (add as CLIENT if not)
    const orgMembership = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: project.organizationId,
        },
      },
    });

    if (!orgMembership) {
      await prisma.organizationMember.create({
        data: {
          userId: user.id,
          organizationId: project.organizationId,
          role: "CLIENT",
        },
      });
    }

    // Add as project client
    const projectClient = await prisma.projectClient.create({
      data: {
        userId: user.id,
        projectId,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    return NextResponse.json(projectClient, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Add project client error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/projects/[projectId]/clients
 * Remove a client from this project.
 * Only org admins can remove clients.
 */
export async function DELETE(
  req: Request,
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
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const membership = project.organization.members.find(
      (m) => m.userId === session.user.id,
    );

    if (!membership || membership.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only admins can remove clients" },
        { status: 403 },
      );
    }

    const { clientId } = (await req.json()) as { clientId?: string };

    if (!clientId) {
      return NextResponse.json(
        { error: "clientId is required" },
        { status: 400 },
      );
    }

    await prisma.projectClient.delete({
      where: { id: clientId },
    });

    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

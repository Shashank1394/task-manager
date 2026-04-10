import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";

export async function POST(
  req: Request,
  context: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await context.params;

  const session = await requireAuth();
  const { name, description } = await req.json();

  if (!name || name.trim().length < 3) {
    return NextResponse.json(
      { error: "Project name is required" },
      { status: 400 },
    );
  }

  const membership = await prisma.organizationMember.findFirst({
    where: {
      organizationId: orgId,
      userId: session.user.id,
    },
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await prisma.project.create({
    data: {
      name,
      description,
      organizationId: orgId,
      board: { create: {} },
    },
    include: { board: true },
  });

  return NextResponse.json(project, { status: 201 });
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await context.params;

  const session = await requireAuth();

  const membership = await prisma.organizationMember.findFirst({
    where: {
      organizationId: orgId,
      userId: session.user.id,
    },
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Clients cannot list projects directly
  if (membership.role === "CLIENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const projects = await prisma.project.findMany({
    where: {
      organizationId: orgId,
    },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      board: { select: { id: true } },
    },
  });

  return NextResponse.json(projects);
}

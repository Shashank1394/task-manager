import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";

export async function GET(req: Request) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();

    if (!q || q.length < 2) {
      return NextResponse.json({ tasks: [], projects: [], members: [] });
    }

    // Get all orgs the user belongs to (non-client)
    const memberships = await prisma.organizationMember.findMany({
      where: { userId: session.user.id, role: { not: "CLIENT" } },
      select: { organizationId: true },
    });

    const orgIds = memberships.map((m) => m.organizationId);

    if (orgIds.length === 0) {
      return NextResponse.json({ tasks: [], projects: [], members: [] });
    }

    const [tasks, projects, members] = await Promise.all([
      // Search tasks
      prisma.task.findMany({
        where: {
          title: { contains: q, mode: "insensitive" },
          board: {
            project: { organizationId: { in: orgIds } },
          },
        },
        take: 10,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          board: {
            select: {
              project: {
                select: { id: true, name: true },
              },
            },
          },
        },
      }),

      // Search projects
      prisma.project.findMany({
        where: {
          name: { contains: q, mode: "insensitive" },
          organizationId: { in: orgIds },
        },
        take: 8,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          organization: { select: { name: true } },
        },
      }),

      // Search members across user's orgs
      prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
          memberships: {
            some: { organizationId: { in: orgIds } },
          },
        },
        take: 6,
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      }),
    ]);

    return NextResponse.json({
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        projectId: t.board.project.id,
        projectName: t.board.project.name,
      })),
      projects,
      members,
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

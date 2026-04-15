import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";

/**
 * GET /api/notifications — get notifications for current user
 */
export async function GET() {
  try {
    const session = await requireAuth();

    const notifications = await prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    const unreadCount = await prisma.notification.count({
      where: { userId: session.user.id, read: false },
    });

    return NextResponse.json({ notifications, unreadCount });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/**
 * PATCH /api/notifications — mark notifications as read
 * Body: { ids: string[] } or { all: true }
 */
export async function PATCH(req: Request) {
  try {
    const session = await requireAuth();
    const body = await req.json();

    if (body.all) {
      await prisma.notification.updateMany({
        where: { userId: session.user.id, read: false },
        data: { read: true },
      });
    } else if (Array.isArray(body.ids)) {
      await prisma.notification.updateMany({
        where: {
          id: { in: body.ids },
          userId: session.user.id,
        },
        data: { read: true },
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

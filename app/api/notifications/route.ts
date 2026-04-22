import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { handleRouteError, unauthorized, badRequest } from "@/lib/api-errors";
import { z } from "zod";

const patchNotificationsSchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({
    ids: z.array(z.string().trim().min(1)).min(1),
  }),
]);

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
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

/**
 * PATCH /api/notifications — mark notifications as read
 * Body: { ids: string[] } or { all: true }
 */
export async function PATCH(req: Request) {
  try {
    const session = await requireAuth();
    const parsed = patchNotificationsSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw badRequest(
        "Invalid notification update payload",
        parsed.error.flatten(),
      );
    }

    if ("all" in parsed.data && parsed.data.all) {
      await prisma.notification.updateMany({
        where: { userId: session.user.id, read: false },
        data: { read: true },
      });
    } else if ("ids" in parsed.data) {
      await prisma.notification.updateMany({
        where: {
          id: { in: parsed.data.ids },
          userId: session.user.id,
        },
        data: { read: true },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return handleRouteError(unauthorized());
    }
    return handleRouteError(error);
  }
}

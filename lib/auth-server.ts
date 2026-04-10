import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

/**
 * Ensures the user is authenticated.
 * Throws if not authenticated.
 */
export async function requireAuth() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.id) {
    throw new Error("UNAUTHORIZED");
  }

  return session;
}

/**
 * Check if a CLIENT-role user has access to a specific project via ProjectClient.
 * Returns true if:
 *   - The user is NOT a CLIENT (ADMIN/MEMBER always have access)
 *   - The user IS a CLIENT and has a ProjectClient entry for this project
 */
export async function checkClientProjectAccess(
  userId: string,
  projectId: string,
  orgId: string,
): Promise<{ allowed: boolean; role: string }> {
  const membership = await prisma.organizationMember.findFirst({
    where: { organizationId: orgId, userId },
  });

  if (!membership) {
    return { allowed: false, role: "" };
  }

  if (membership.role !== "CLIENT") {
    return { allowed: true, role: membership.role };
  }

  // CLIENT — must have explicit ProjectClient entry
  const clientAccess = await prisma.projectClient.findUnique({
    where: { userId_projectId: { userId, projectId } },
  });

  return { allowed: !!clientAccess, role: "CLIENT" };
}

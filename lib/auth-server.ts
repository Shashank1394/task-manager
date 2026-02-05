import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

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

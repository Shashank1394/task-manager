import { redirect } from "next/navigation";
import DashboardHome from "@/app/components/DashboardHome";
import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const session = await requireAuth();
  const memberships = await prisma.organizationMember.findMany({
    where: { userId: session.user.id },
    select: {
      organizationId: true,
      role: true,
    },
  });

  const hasNonClientAccess = memberships.some(
    (membership) => membership.role !== "CLIENT",
  );
  const firstClientMembership = memberships.find(
    (membership) => membership.role === "CLIENT",
  );

  if (!hasNonClientAccess && firstClientMembership) {
    redirect(`/dashboard/client/${firstClientMembership.organizationId}`);
  }

  return <DashboardHome />;
}

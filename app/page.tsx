import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const loginHref = "/api/auth/signin?callbackUrl=%2Fdashboard";

const landingMetrics = [
  { value: "1 click", label: "from sign-in to workspace" },
  { value: "2 views", label: "team and client dashboard modes" },
  { value: "Live", label: "project, sprint, and GitHub signals" },
];

const landingFeatures = [
  {
    title: "Personalized routing",
    description:
      "Sign in once and DevPilot drops you into the dashboard that matches your role.",
  },
  {
    title: "Delivery intelligence",
    description:
      "Track project health, task flow, sprint pace, and AI briefs in one place.",
  },
  {
    title: "GitHub-aware execution",
    description:
      "Keep repo context, pull requests, issues, and delivery progress aligned.",
  },
];

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main className="welcome">
      <div className="welcome__shell">
        <section className="welcome__hero">
          <div>
            <span className="welcome__eyebrow">DevPilot workspace</span>
            <h1 className="welcome__title">
              See the right dashboard the moment you sign in.
            </h1>
            <p className="welcome__copy">
              DevPilot brings delivery operations, client reporting, task
              execution, and GitHub context into one guided workspace.
              Authenticate once and land directly in the correct dashboard.
            </p>
          </div>

          <div className="welcome__actions">
            <Link href={loginHref} className="welcome__cta">
              Sign in and open dashboard
            </Link>
            <p className="welcome__hint">
              Continue with Google or GitHub on the next step and come straight
              back to your dashboard.
            </p>
          </div>

          <div className="welcome__metrics">
            {landingMetrics.map((metric) => (
              <div key={metric.label} className="welcome__metric">
                <span className="welcome__metric-value">{metric.value}</span>
                <span className="welcome__metric-label">{metric.label}</span>
              </div>
            ))}
          </div>
        </section>

        <aside className="welcome__panel">
          <div>
            <span className="welcome__panel-label">What waits inside</span>
            <p className="welcome__panel-copy">
              The first screen after authentication is your working surface.
              Internal users land on the delivery dashboard, and client-only
              users are routed directly into their client view.
            </p>
          </div>

          <ul className="welcome__feature-list">
            {landingFeatures.map((feature) => (
              <li key={feature.title} className="welcome__feature">
                <span className="welcome__feature-label">{feature.title}</span>
                <p>{feature.description}</p>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </main>
  );
}

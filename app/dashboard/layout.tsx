import Sidebar from "../components/layout/Sidebar";
import Topbar from "../components/layout/Topbar";
import Providers from "../components/Providers";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <div className="dashboard">
        <aside className="dashboard__sidebar">
          <Sidebar />
        </aside>

        <div className="dashboard__main">
          <header className="dashboard__topbar">
            <Topbar />
          </header>

          <main className="dashboard__content">{children}</main>
        </div>
      </div>
    </Providers>
  );
}

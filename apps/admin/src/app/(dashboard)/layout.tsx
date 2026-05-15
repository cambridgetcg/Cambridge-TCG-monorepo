import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

/**
 * Dashboard layout — authenticated pages with sidebar + header chrome.
 * Auth enforcement happens in middleware.ts — by the time we reach here
 * the user is guaranteed to be an admin.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <Header />
      <main className="ml-[220px] mt-14 min-h-[calc(100vh-3.5rem)] p-6">
        {children}
      </main>
    </>
  );
}

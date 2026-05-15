/**
 * Auth layout — clean, no chrome.
 * Used for /login and /login/check-email.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950">
      {children}
    </div>
  );
}

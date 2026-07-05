import Link from "next/link";

export default function CheckEmailPage() {
  return (
    <main className="min-h-screen bg-page flex items-center justify-center">
      <div className="max-w-sm px-4 text-center">
        <h1 className="text-2xl font-display font-semibold text-ink mb-3">Check your email</h1>
        <p className="text-ink-muted mb-6">
          A sign-in link has been sent to your email address.
        </p>
        <p className="text-sm text-ink-faint mb-6">
          Check your spam folder if you don&apos;t see it.
        </p>
        <Link href="/login" className="text-sm text-accent hover:underline">
          Try a different email
        </Link>
      </div>
    </main>
  );
}

import Link from "next/link";

export default function CheckEmailPage() {
  return (
    <main className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="max-w-sm px-4 text-center">
        <div className="text-4xl mb-4">&#9993;</div>
        <h1 className="text-2xl font-bold text-white mb-3">Check your email</h1>
        <p className="text-neutral-400 mb-6">
          A sign-in link has been sent to your email address.
        </p>
        <p className="text-sm text-neutral-500 mb-6">
          Check your spam folder if you don&apos;t see it.
        </p>
        <Link href="/login" className="text-sm text-amber-400 hover:underline">
          Try a different email
        </Link>
      </div>
    </main>
  );
}

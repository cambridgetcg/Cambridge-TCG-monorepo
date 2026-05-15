import { signIn } from "@/lib/auth";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const metadata = { title: "Sign In" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  // Already signed in → go to overview
  const session = await auth();
  if (session?.user?.role === "admin") {
    redirect("/overview");
  }

  const { error } = await searchParams;

  return (
    <div className="w-full max-w-sm">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8">
        <div className="mb-8">
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-500 mb-2">
            Cambridge TCG
          </p>
          <h1 className="text-xl font-semibold text-white">Admin sign in</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Enter your email to receive a sign-in link.
          </p>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            {error === "AccessDenied"
              ? "Access denied. Your account does not have admin privileges."
              : "Something went wrong. Please try again."}
          </div>
        )}

        <form
          action={async (formData: FormData) => {
            "use server";
            const email = formData.get("email") as string;
            await signIn("email", { email, redirectTo: "/overview" });
          }}
          className="flex flex-col gap-3"
        >
          <input
            type="email"
            name="email"
            placeholder="you@example.com"
            required
            autoFocus
            className="w-full px-3 py-2 rounded-md bg-neutral-800 border border-neutral-700 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            type="submit"
            className="w-full py-2 px-4 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
          >
            Send sign-in link
          </button>
        </form>
      </div>
    </div>
  );
}

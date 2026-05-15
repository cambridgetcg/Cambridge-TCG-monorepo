import { auth } from "@/lib/auth";
import { signOut } from "@/lib/auth";
import { LogOut } from "lucide-react";

export async function Header() {
  const session = await auth();
  const email = session?.user?.email ?? "";

  return (
    <header className="fixed top-0 left-[220px] right-0 z-30 h-14 flex items-center justify-end gap-3 px-6 bg-neutral-950 border-b border-neutral-800">
      <span className="text-sm text-neutral-400">{email}</span>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button
          type="submit"
          className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-200 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </form>
    </header>
  );
}

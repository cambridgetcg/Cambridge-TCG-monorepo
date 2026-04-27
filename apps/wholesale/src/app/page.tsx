import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isAdminHost } from "@/lib/subdomain";

export default async function Home() {
  const session = await auth();
  if (session) {
    const host = (await headers()).get("host") ?? "";
    redirect(isAdminHost(host) ? "/admin" : "/catalog");
  }
  redirect("/login");
}

import { redirect } from "next/navigation";

/**
 * Root route — redirect to overview (middleware ensures auth first).
 */
export default function RootPage() {
  redirect("/overview");
}

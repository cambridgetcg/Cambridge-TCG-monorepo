import { redirect } from "next/navigation";

export default async function BountyVerifyRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/verify/pull/${id}`);
}

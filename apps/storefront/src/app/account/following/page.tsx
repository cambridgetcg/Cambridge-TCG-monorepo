"use client";

import Link from "next/link";
import { FollowList } from "@/components/social/FollowList";

import { Audience } from "@/lib/ui";
export default function FollowingPage() {
  return (
    <div>
      <Audience kind="consumer" />
      <div className="mb-6">
        <h1 className="text-2xl font-display font-semibold text-ink">Following</h1>
        <p className="text-ink-faint text-sm mt-1">
          Traders whose activity shows up in your feed.{" "}
          <Link href="/account/followers" className="text-accent hover:text-accent-strong">
            See who follows you →
          </Link>
        </p>
      </div>
      <FollowList mode="following" />
    </div>
  );
}

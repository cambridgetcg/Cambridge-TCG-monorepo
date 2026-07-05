"use client";

import Link from "next/link";
import { FollowList } from "@/components/social/FollowList";

import { Audience } from "@/lib/ui";
export default function FollowersPage() {
  return (
    <div>
      <Audience kind="consumer" />
      <div className="mb-6">
        <h1 className="text-2xl font-display font-semibold text-ink">Followers</h1>
        <p className="text-ink-faint text-sm mt-1">
          People who follow your collection.{" "}
          <Link href="/account/following" className="text-accent hover:text-accent-strong">
            See who you follow →
          </Link>
        </p>
      </div>
      <FollowList mode="followers" />
    </div>
  );
}

"use client";

import Link from "next/link";
import { FollowList } from "@/components/social/FollowList";

import { Audience } from "@/lib/ui";
export default function FollowingPage() {
  return (
    <div>
      <Audience kind="consumer" />
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">Following</h1>
        <p className="text-neutral-500 text-sm mt-1">
          Traders whose activity shows up in your feed.{" "}
          <Link href="/account/followers" className="text-amber-400 hover:text-amber-300">
            See who follows you →
          </Link>
        </p>
      </div>
      <FollowList mode="following" />
    </div>
  );
}

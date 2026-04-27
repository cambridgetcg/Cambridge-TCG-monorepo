"use client";

import Link from "next/link";
import { FollowList } from "@/components/social/FollowList";

export default function FollowersPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">Followers</h1>
        <p className="text-neutral-500 text-sm mt-1">
          People who follow your collection.{" "}
          <Link href="/account/following" className="text-amber-400 hover:text-amber-300">
            See who you follow →
          </Link>
        </p>
      </div>
      <FollowList mode="followers" />
    </div>
  );
}

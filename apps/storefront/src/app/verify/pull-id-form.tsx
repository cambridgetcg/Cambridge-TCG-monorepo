"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function PullIdForm() {
  const router = useRouter();
  const [value, setValue] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const id = value.trim();
        if (/^[0-9a-fA-F-]{36}$/.test(id)) {
          router.push(`/verify/pull/${id}`);
        }
      }}
      className="flex gap-2"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="00000000-0000-0000-0000-000000000000"
        className="flex-1 bg-surface-elevated border border-border-strong rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-accent"
        required
      />
      <button
        type="submit"
        className="px-4 py-2 bg-accent hover:bg-accent-strong text-black font-bold rounded-lg text-sm transition"
      >
        Verify
      </button>
    </form>
  );
}

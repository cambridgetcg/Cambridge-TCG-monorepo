"use client";

import { useState } from "react";

export default function NotifyMe() {
  const [clicked, setClicked] = useState(false);

  function handleClick() {
    setClicked(true);
    setTimeout(() => setClicked(false), 3000);
  }

  return (
    <button
      onClick={handleClick}
      className="px-8 py-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold rounded-xl transition text-lg"
    >
      {clicked ? "Coming soon — we'll add email notifications shortly!" : "Notify Me When Available"}
    </button>
  );
}

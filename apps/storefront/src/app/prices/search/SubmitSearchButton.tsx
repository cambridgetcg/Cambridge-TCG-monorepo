"use client";

/**
 * Submit button with a pending state — the page's ONLY client island.
 *
 * The search page is a server-rendered GET form (URL-driven, works with
 * JS disabled). The one thing that model can't give is feedback between
 * pressing Search and the server's response — the old page sat frozen
 * for the full round trip and felt dead. This button listens to its own
 * form's submit event and flips to "Searching…" until the navigation
 * lands. Progressive enhancement: without JS it's a plain submit button.
 */

import { useEffect, useRef, useState } from "react";

export function SubmitSearchButton() {
  const ref = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onSubmit = () => setPending(true);
    // bfcache restore (back button) re-shows the old page — reset.
    const onPageShow = () => setPending(false);
    form.addEventListener("submit", onSubmit);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      form.removeEventListener("submit", onSubmit);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return (
    <button
      ref={ref}
      type="submit"
      aria-busy={pending}
      className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-black hover:bg-amber-400 transition disabled:opacity-70"
      disabled={pending}
    >
      {pending ? "Searching…" : "Search →"}
    </button>
  );
}

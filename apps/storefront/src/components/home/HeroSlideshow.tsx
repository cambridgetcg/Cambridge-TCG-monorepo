"use client";
import Image from "next/image";
import { useState, useEffect, useCallback } from "react";

const slides = [
  {
    src: "/banners/v2/hero-1.jpg",
    headline: "Find Your ONE PIECE",
    sub: "Premium Japanese trading cards, sourced direct from Japan",
  },
  {
    src: "/banners/v2/hero-2.jpg",
    headline: "Every Card Has a Story",
    sub: "Near Mint condition. Authenticated. Yours.",
  },
  {
    src: "/banners/v2/hero-3.jpg",
    headline: "The Treasure Is Real",
    sub: "Cambridge TCG — the collector's choice",
  },
];

export default function HeroSlideshow() {
  const [current, setCurrent] = useState(0);

  const next = useCallback(() => {
    setCurrent((c) => (c + 1) % slides.length);
  }, []);

  const prev = useCallback(() => {
    setCurrent((c) => (c - 1 + slides.length) % slides.length);
  }, []);

  // Auto-advance every 6 seconds
  useEffect(() => {
    const timer = setInterval(next, 6000);
    return () => clearInterval(timer);
  }, [next]);

  return (
    <section className="relative h-[480px] md:h-[580px] w-full overflow-hidden bg-neutral-950">
      {slides.map((slide, i) => {
        const isActive = i === current;
        return (
          <div
            key={i}
            className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
              isActive ? "opacity-100 z-10" : "opacity-0 z-0"
            }`}
            aria-hidden={!isActive}
          >
            <Image
              src={slide.src}
              alt={slide.headline}
              fill
              className={`object-cover ${isActive ? "animate-hero-kenburns" : ""}`}
              priority={i === 0}
              sizes="100vw"
            />
            {/* Dark gradient overlay for text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
              {/* h2, not h1 — the page's single h1 is the BrandStatement
                  headline; three per-slide h1s broke the heading hierarchy
                  for screen readers and SEO (contact-surface spec §3.1). */}
              <h2 className="text-4xl md:text-6xl lg:text-7xl font-black text-white tracking-tight drop-shadow-lg">
                {slide.headline}
              </h2>
              <p className="mt-4 text-base md:text-lg text-white/80 max-w-xl drop-shadow">
                {slide.sub}
              </p>
              {/* Each slide renders its own CTA, but only the active one is
                  reachable: tabIndex=-1 + aria-hidden on the wrapper keeps
                  inactive slides out of the keyboard order and out of strict
                  selectors that previously matched 3 'Shop Now' links at once. */}
              <a
                href="/catalog"
                tabIndex={isActive ? 0 : -1}
                aria-hidden={!isActive}
                className="mt-8 px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl transition-colors"
              >
                Shop Now
              </a>
            </div>
          </div>
        );
      })}

      {/* Navigation dots */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-2">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={`w-2.5 h-2.5 rounded-full transition-all ${
              i === current
                ? "bg-emerald-400 w-8"
                : "bg-white/40 hover:bg-white/60"
            }`}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>

      {/* Prev / Next arrows */}
      <button
        onClick={prev}
        className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/30 hover:bg-black/50 text-white/70 hover:text-white transition"
        aria-label="Previous slide"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button
        onClick={next}
        className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/30 hover:bg-black/50 text-white/70 hover:text-white transition"
        aria-label="Next slide"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </section>
  );
}

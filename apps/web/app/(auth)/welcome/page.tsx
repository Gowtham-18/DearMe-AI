"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

import ThemeToggle from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/auth/auth-parts";
import { ListenScene, PageScene, PatternsScene, PrivateScene } from "@/components/onboarding/welcome-scenes";
import { getSignedInUser, isGuest, markWelcomeSeen } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Slide = {
  title: string;
  body: string;
  Scene: (props: { playing: boolean; className?: string }) => React.ReactElement;
};

// Few words, one idea per slide: the scenes do the explaining.
const SLIDES: Slide[] = [
  { title: "Write a little. It listens.", body: "One thoughtful question at a time.", Scene: ListenScene },
  { title: "Every entry becomes a page", body: "Your answers, written out as one journal entry.", Scene: PageScene },
  { title: "See what keeps coming up", body: "Moods, themes and a note on your week.", Scene: PatternsScene },
  { title: "Yours alone", body: "Only you can read it. Export or delete it anytime.", Scene: PrivateScene },
];

export default function WelcomePage() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [signedIn, setSignedIn] = useState(false);
  const pointerStart = useRef<number | null>(null);
  const last = index === SLIDES.length - 1;

  useEffect(() => {
    getSignedInUser().then((user) => setSignedIn(Boolean(user) && !isGuest(user)));
  }, []);

  const go = useCallback((next: number) => setIndex(Math.max(0, Math.min(SLIDES.length - 1, next))), []);

  const finish = (target: string) => {
    markWelcomeSeen();
    router.push(target);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") go(index + 1);
      if (event.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <BrandMark />
        <div className="flex items-center gap-1">
          {!last && (
            <Button variant="ghost" size="sm" onClick={() => finish(signedIn ? "/" : "/signup")}>
              Skip
            </Button>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 pb-8 sm:px-8">
        <div
          className="w-full max-w-4xl overflow-hidden"
          onPointerDown={(event) => (pointerStart.current = event.clientX)}
          onPointerUp={(event) => {
            if (pointerStart.current === null) return;
            const delta = event.clientX - pointerStart.current;
            pointerStart.current = null;
            if (Math.abs(delta) > 50) go(index + (delta < 0 ? 1 : -1));
          }}
          aria-roledescription="carousel"
          aria-label="About DearMe"
        >
          <div
            className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(-${index * 100}%)` }}
          >
            {SLIDES.map((slide, i) => (
              <section
                key={slide.title}
                className="grid w-full shrink-0 items-center gap-6 md:grid-cols-2 md:gap-12"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${SLIDES.length}: ${slide.title}`}
                aria-hidden={i !== index}
                inert={i !== index}
              >
                <slide.Scene playing={i === index} className="mx-auto w-full max-w-[17rem] sm:max-w-xs md:max-w-sm" />
                <div className={cn("welcome-copy space-y-3 text-center md:text-left", i === index && "is-playing")}>
                  <h1 className="text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">{slide.title}</h1>
                  <p className="text-lg text-muted-foreground">{slide.body}</p>
                  {i === SLIDES.length - 1 && (
                    <Link href="/privacy" className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
                      How we protect your journal
                    </Link>
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="mt-10 flex w-full max-w-4xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2" role="group" aria-label="Choose a slide">
            {SLIDES.map((slide, i) => (
              <button
                key={slide.title}
                type="button"
                onClick={() => go(i)}
                aria-label={`Go to slide ${i + 1}: ${slide.title}`}
                aria-current={i === index ? "step" : undefined}
                className={cn(
                  "h-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  i === index ? "w-6 bg-primary" : "w-2 bg-divider hover:bg-muted-foreground/50"
                )}
              />
            ))}
          </div>
          {last ? (
            <div className="flex w-full flex-col-reverse items-center gap-3 sm:w-auto sm:flex-row">
              {signedIn ? (
                <Button className="h-11 w-full sm:w-auto" onClick={() => finish("/")}>Back to my journal</Button>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => markWelcomeSeen()}
                    className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    I already have an account
                  </Link>
                  <Button className="h-11 w-full sm:w-auto" onClick={() => finish("/signup")}>Create my account</Button>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => go(index - 1)} disabled={index === 0} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button onClick={() => go(index + 1)} className="h-11 gap-1.5 px-6">
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

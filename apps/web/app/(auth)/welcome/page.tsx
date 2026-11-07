"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

import ThemeToggle from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/auth/auth-parts";
import {
  HowItWorksIllustration,
  PatternsIllustration,
  PrivateIllustration,
  RememberIllustration,
  WriteIllustration,
} from "@/components/auth/illustrations";
import { getSignedInUser, isGuest, markWelcomeSeen } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Slide = {
  eyebrow: string;
  title: string;
  body?: string;
  steps?: string[];
  points?: string[];
  Illustration: (props: { className?: string }) => React.ReactElement;
};

const SLIDES: Slide[] = [
  {
    eyebrow: "Welcome to DearMe",
    title: "A journal that listens",
    body: "Write a few lines and DearMe answers with one thoughtful question at a time, so you go a little deeper than you would on your own.",
    Illustration: WriteIllustration,
  },
  {
    eyebrow: "How it works",
    title: "Five minutes is enough",
    steps: [
      "Pick how you feel and how much time you have.",
      "Choose a prompt. Each one shows an example answer.",
      "Answer one question at a time, and finish whenever you're ready.",
      "Read it back later as a page in your journal.",
    ],
    Illustration: HowItWorksIllustration,
  },
  {
    eyebrow: "Insights",
    title: "See your patterns",
    body: "Insights show the tone of your writing over time, the themes that keep coming up, and a short reflection on your week.",
    Illustration: PatternsIllustration,
  },
  {
    eyebrow: "Memory",
    title: "Remembers what matters",
    body: "Mention “my interview on Friday” and DearMe can ask how it went afterwards. You can see, and forget, everything it remembers.",
    Illustration: RememberIllustration,
  },
  {
    eyebrow: "Privacy",
    title: "Private by design",
    points: [
      "Only your account can read your journal.",
      "Never used to train AI models.",
      "Analysis runs on DearMe's own server with open-source models.",
      "Outside AI is used only if you turn on AI replies.",
      "Export or delete everything at any time.",
    ],
    Illustration: PrivateIllustration,
  },
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
                <slide.Illustration className="mx-auto w-full max-w-[18rem] md:max-w-sm" />
                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">{slide.eyebrow}</p>
                  <h1 className="text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">{slide.title}</h1>
                  {slide.body && <p className="max-w-prose text-base text-muted-foreground">{slide.body}</p>}
                  {slide.steps && (
                    <ol className="space-y-3">
                      {slide.steps.map((step, n) => (
                        <li key={step} className="flex gap-3 text-sm text-foreground sm:text-base">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-divider bg-card text-xs font-semibold tabular-nums">
                            {n + 1}
                          </span>
                          <span className="pt-0.5">{step}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {slide.points && (
                    <ul className="space-y-2.5">
                      {slide.points.map((point) => (
                        <li key={point} className="flex gap-3 text-sm text-foreground sm:text-base">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                          {point}
                        </li>
                      ))}
                    </ul>
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

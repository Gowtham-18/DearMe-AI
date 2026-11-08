"use client";

import { useEffect, useState } from "react";
import localFont from "next/font/local";
import { Check, Copy, Heart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toFirstPerson, type JournalStory } from "@/lib/journal-story";

// Bundled with the app (SIL OFL, see app/fonts) so builds never depend on fetching Google Fonts.
const hand = localFont({ src: "../../app/fonts/caveat-latin-wght-normal.woff2", weight: "400 700", display: "swap" });
const serif = localFont({
  src: [
    { path: "../../app/fonts/literata-latin-wght-normal.woff2", weight: "200 900", style: "normal" },
    { path: "../../app/fonts/literata-latin-wght-italic.woff2", weight: "200 900", style: "italic" },
  ],
  display: "swap",
});

type JournalPageProps = {
  story: JournalStory;
  entryDate: string;
  mood: string | null;
  timeBudget: number;
  signature?: string | null;
  /** Remembers the to-do's tick on this device. */
  entryId?: string;
};

const longDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** One entry drawn as a page in a ruled notebook. Everything here is composed on this device. */
export default function JournalPage({ story, entryDate, mood, timeBudget, signature, entryId }: JournalPageProps) {
  const [showQuestions, setShowQuestions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState(false);
  const hasQuestions = story.passages.some((passage) => passage.question) || Boolean(story.closing?.question);
  const empty = story.paragraphs.length === 0;
  const closing = story.closing;
  const todoKey = entryId ? `dearme:todo-done:${entryId}` : null;

  useEffect(() => {
    if (!todoKey) return;
    try {
      setDone(window.localStorage.getItem(todoKey) === "1");
    } catch {
      // Storage unavailable: the tick just isn't remembered.
    }
  }, [todoKey]);

  const toggleDone = (value: boolean) => {
    setDone(value);
    if (!todoKey) return;
    try {
      if (value) window.localStorage.setItem(todoKey, "1");
      else window.localStorage.removeItem(todoKey);
    } catch {
      // ignore
    }
  };

  const plainText = [
    story.openingJoined ? null : story.opening,
    ...story.paragraphs,
    closing?.sentence ?? null,
    closing ? `Tomorrow: ${closing.todo}` : null,
    closing ? `Note to self: ${closing.affirmation}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {hasQuestions && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 rounded-full px-3 text-muted-foreground"
            onClick={() => setShowQuestions((value) => !value)}
            aria-pressed={showQuestions}
          >
            {showQuestions ? "Hide the questions" : "Show the questions"}
          </Button>
        )}
        {!empty && (
          <Button size="sm" variant="ghost" className="h-8 gap-1.5 rounded-full px-3 text-muted-foreground" onClick={handleCopy}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy text"}
          </Button>
        )}
      </div>

      <article className={`journal-paper ${serif.className}`} aria-label={`Journal page for ${longDate(entryDate)}`}>
        <header className="journal-paper__head">
          <p className={`${hand.className} journal-paper__date`}>{longDate(entryDate)}</p>
          <p className="journal-paper__meta">
            {mood ? `${mood} · ` : ""}
            {timeBudget} min
          </p>
        </header>

        {story.opening && (!story.openingJoined || showQuestions) && <p className="journal-paper__opening">{story.opening}</p>}

        {empty ? (
          <p className="journal-paper__soft">Nothing was written in this entry.</p>
        ) : showQuestions ? (
          story.passages.map((passage, index) => (
            <div key={index}>
              {passage.question && index > 0 && (
                <p className={`${hand.className} journal-paper__question`}>{toFirstPerson(passage.question)}</p>
              )}
              <p className={`${hand.className} journal-paper__text journal-paper__hand`}>{passage.answer}</p>
            </div>
          ))
        ) : (
          story.paragraphs.map((paragraph, index) => (
            <p
              key={index}
              className={`${hand.className} journal-paper__text journal-paper__text--indent journal-paper__hand journal-paper__ink`}
              style={{ animationDelay: `${Math.min(index, 6) * 0.35}s` }}
            >
              {paragraph}
            </p>
          ))
        )}

        {closing && !empty && (
          <section
            className="journal-paper__closing journal-paper__ink"
            style={{ animationDelay: `${Math.min(story.paragraphs.length, 6) * 0.35 + 0.2}s` }}
            aria-label="Looking ahead"
          >
            {showQuestions && closing.question && (
              <p className={`${hand.className} journal-paper__question`}>{closing.question}</p>
            )}
            {showQuestions && closing.answer ? (
              <p className={`${hand.className} journal-paper__text journal-paper__hand`}>{closing.answer}</p>
            ) : (
              closing.sentence &&
              closing.todoSuggested && (
                <p className={`${hand.className} journal-paper__text journal-paper__text--indent journal-paper__hand`}>
                  {closing.sentence}
                </p>
              )
            )}
            {/* Their own plan is the to-do, written as a sentence; otherwise one suggested step. */}
            <label className="journal-paper__todo">
              <span className="journal-paper__todo-label">
                {closing.todoSuggested ? "One small thing for tomorrow" : "For tomorrow"}
              </span>
              <span className="journal-paper__todo-row">
                <input type="checkbox" checked={done} onChange={(event) => toggleDone(event.target.checked)} />
                <span className={`${hand.className} journal-paper__todo-text ${done ? "is-done" : ""}`}>
                  {!closing.todoSuggested && closing.sentence && !showQuestions ? closing.sentence : closing.todo}
                </span>
              </span>
            </label>
            <p className="journal-paper__affirmation">
              <Heart className="journal-paper__affirmation-icon" aria-hidden="true" />
              <span className={hand.className}>{closing.affirmation}</span>
            </p>
          </section>
        )}

        {signature && !empty && <p className={`${hand.className} journal-paper__signature`}>— {signature}</p>}
      </article>
      <p className="text-xs text-muted-foreground">
        Written out on your device from your answers, so the page reads as one entry in your own words. The note to self
        and tomorrow&apos;s step come from what you wrote. No AI service sees this.
      </p>
    </div>
  );
}

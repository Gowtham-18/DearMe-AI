import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "@/components/auth/auth-parts";

export const metadata: Metadata = {
  title: "Privacy notice · DearMe",
  description: "What DearMe collects, where it's stored, who can see it, and how to export or delete it.",
};

const UPDATED = "7 November 2026";
const CONTACT = "dearme.journal.app@gmail.com";

const PROVIDERS: Array<{ name: string; role: string; data: string; where: string }> = [
  {
    name: "Supabase",
    role: "Database and sign-in",
    data: "Your account, profile and journal (entries, conversations, insights, memories).",
    where: "AWS us-west-2, Oregon, USA",
  },
  {
    name: "Vercel",
    role: "Website and app server",
    data: "Passes your requests to the database and the analysis service. Keeps short request logs (IP address, page, time).",
    where: "Washington, D.C., USA, plus a global network for the website's files",
  },
  {
    name: "Render",
    role: "DearMe's analysis service",
    data: "Reads the text of an entry or message in memory to write a reply or find themes, then forgets it. Its logs hold ids and lengths, never text.",
    where: "Google Cloud us-west1, Oregon, USA",
  },
  {
    name: "Google",
    role: "Email codes, and Google sign-in if you use it",
    data: "Your email address and the one-time code we send. With Google sign-in, Google tells us your name and email.",
    where: "Google's global infrastructure",
  },
  {
    name: "AI reply provider",
    role: "Only if you turn on AI replies",
    data: "Your recent messages in that conversation and up to two short past snippets, to write the reply. Never used to train models.",
    where: "USA",
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-surface">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" aria-label="DearMe home">
          <BrandMark />
        </Link>
        <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          Back to DearMe
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <article className="privacy-prose space-y-10">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Privacy notice</h1>
            <p className="text-sm text-muted-foreground">Last updated {UPDATED}</p>
          </div>

          <section aria-labelledby="short" className="rounded-2xl border bg-card p-5 sm:p-6">
            <h2 id="short">The short version</h2>
            <ul>
              <li>Your journal is yours. We use it only to run DearMe for you: no ads, no selling, no training AI models.</li>
              <li>Other people can&apos;t read your journal. Turn on <strong>journal lock</strong> and no one else can, including us.</li>
              <li>Replies and insights come from DearMe&apos;s own analysis service. Outside AI is used only if you switch on AI replies.</li>
              <li>Everything is stored in the United States, with the providers listed below.</li>
              <li>You can export everything, or delete it for good, at any time from Settings.</li>
            </ul>
          </section>

          <section aria-labelledby="collect">
            <h2 id="collect">What we collect</h2>
            <dl>
              <dt>Your account</dt>
              <dd>Email address, username, and a password (stored only as a one-way hash by Supabase). With Google sign-in, your Google name and email.</dd>
              <dt>Your profile</dt>
              <dd>The name, age and occupation you give us, and your settings.</dd>
              <dt>Your journal</dt>
              <dd>Entries, your conversations with the companion, and the prompts you chose.</dd>
              <dt>What DearMe works out from it</dt>
              <dd>
                Mood and tone scores, key phrases, recurring themes, weekly reflections, things it remembers (people and
                upcoming events you mention, which you can view and forget), and numeric &quot;fingerprints&quot; of each entry
                used to find related past entries.
              </dd>
              <dt>Technical data</dt>
              <dd>Counters that limit how often features can be used, and our providers&apos; standard request logs (IP address, time, page). Our own logs record ids and lengths, never what you wrote.</dd>
            </dl>
            <p>We don&apos;t use analytics, advertising trackers or third-party cookies. The app stores your sign-in session and a few preferences in your browser.</p>
          </section>

          <section aria-labelledby="who-reads">
            <h2 id="who-reads">Who can read your journal</h2>
            <p>
              <strong>Other users can&apos;t.</strong> Database rules check every request against your account, and we test this with
              two accounts trying to read, change or delete each other&apos;s data.
            </p>
            <p>
              <strong>Without journal lock</strong>, your journal is encrypted on disk by Supabase, but the people who run DearMe have
              administrator access to the database and could technically read it. We don&apos;t look at journals, except when you ask
              us to help with a problem.
            </p>
            <p>
              <strong>With journal lock on</strong> (Settings → Journal lock), your entries, conversations, insights and memories are
              encrypted in your browser with a key made from your passphrase before they&apos;re saved. We never receive the passphrase
              or the key, so no one but you can read what&apos;s stored, including us, Supabase, and anyone who gets a copy of the
              database. To write a reply, the companion still sees the message you&apos;re answering for a moment. It isn&apos;t
              stored or logged. If you forget your passphrase and lose your recovery code, we can&apos;t recover a locked journal.
            </p>
          </section>

          <section aria-labelledby="providers">
            <h2 id="providers">Where your data goes</h2>
            <p>These providers process data for us, only to run DearMe. Each is bound by its own data-processing terms.</p>
            <div className="overflow-x-auto rounded-2xl border">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="bg-muted/50 text-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Provider</th>
                    <th scope="col" className="px-4 py-3 font-semibold">What it does with your data</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Where</th>
                  </tr>
                </thead>
                <tbody>
                  {PROVIDERS.map((provider) => (
                    <tr key={provider.name} className="border-t align-top">
                      <th scope="row" className="px-4 py-3 font-medium text-foreground">
                        {provider.name}
                        <span className="block text-xs font-normal text-muted-foreground">{provider.role}</span>
                      </th>
                      <td className="px-4 py-3 text-muted-foreground">{provider.data}</td>
                      <td className="px-4 py-3 text-muted-foreground">{provider.where}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              If you live outside the United States (for example in India, the UK or the EU), using DearMe means your data is stored
              and processed in the United States by these providers.
            </p>
          </section>

          <section aria-labelledby="keep">
            <h2 id="keep">How long we keep it</h2>
            <ul>
              <li>Your journal and account stay until you delete them.</li>
              <li>Deleting your data or your account removes it from the live database straight away, in a single step.</li>
              <li>Encrypted backups (when enabled) are kept for at most 30 days, so deleted data is gone from them within 30 days.</li>
              <li>Provider request logs are kept for their standard periods, typically days to a few weeks.</li>
            </ul>
          </section>

          <section aria-labelledby="choices">
            <h2 id="choices">Your choices and rights</h2>
            <ul>
              <li><strong>Export</strong> everything as a file: Settings → Export data.</li>
              <li><strong>Delete</strong> your journal, or your whole account: Settings and Account.</li>
              <li><strong>Memory</strong>: see what DearMe remembers, forget items, or turn memory off in Settings.</li>
              <li><strong>AI replies</strong> are off unless you turn them on, and you can turn them off any time.</li>
              <li><strong>Journal lock</strong>: turn on end-to-end encryption in Settings → Journal lock.</li>
              <li><strong>Correct</strong> your profile at any time in Account.</li>
            </ul>
            <p>
              For anything else, including access, correction or deletion requests under India&apos;s Digital Personal Data
              Protection Act or the GDPR, email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. We&apos;ll reply within 30 days.
            </p>
          </section>

          <section aria-labelledby="security">
            <h2 id="security">How we protect it</h2>
            <ul>
              <li>Encrypted connections (HTTPS) everywhere, and encryption on disk by our providers.</li>
              <li>Access rules in the database on every table, tested with two accounts on every change.</li>
              <li>Rate limits on sign-in and on every feature, and email verification for new accounts.</li>
              <li>The analysis service only answers DearMe&apos;s own server, and never logs journal text.</li>
              <li>Optional journal lock, so what&apos;s stored can only be read with your passphrase.</li>
            </ul>
          </section>

          <section aria-labelledby="other">
            <h2 id="other">Good to know</h2>
            <p>DearMe is meant for adults (18 and over). It&apos;s a journal, not a medical or crisis service. If you might be in danger, call your local emergency number; in the US, call or text 988.</p>
            <p>If we change this notice in a way that matters, we&apos;ll tell you in the app before it applies.</p>
            <p>
              Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}

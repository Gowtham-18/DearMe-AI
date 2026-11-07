"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-parts";
import { getSignedInUser } from "@/lib/auth";
import { authErrorMessage } from "@/lib/auth-validation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** Only same-site paths, so the link can't bounce someone to another website. */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

/** Google (and emailed links) return here with a one-time code, exchanged for a session (PKCE). */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.slice(1));
      const description = url.searchParams.get("error_description") ?? hash.get("error_description");
      const errorCode = url.searchParams.get("error_code") ?? hash.get("error_code") ?? undefined;
      if (description) {
        if (alive) setError(authErrorMessage({ message: description, code: errorCode }));
        return;
      }
      const code = url.searchParams.get("code");
      if (code) {
        const { error: exchangeError } = await getSupabaseBrowserClient().auth.exchangeCodeForSession(code);
        if (exchangeError) {
          if (alive) setError(authErrorMessage(exchangeError));
          return;
        }
      }
      const user = await getSignedInUser();
      if (alive) router.replace(user ? safeNext(url.searchParams.get("next")) : "/login");
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  return (
    <AuthShell title={error ? "We couldn't sign you in" : "Signing you in..."}>
      {error ? (
        <div className="space-y-4">
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>
          <Link href="/login" className="inline-block text-sm font-medium text-foreground underline-offset-4 hover:underline">Back to log in</Link>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> One moment...
        </p>
      )}
    </AuthShell>
  );
}

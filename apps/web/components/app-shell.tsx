"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import Sidebar from "@/components/sidebar";
import TopHeader from "@/components/top-header";
import OnboardingModal from "@/components/onboarding/OnboardingModal";
import AppLoading from "@/components/app-loading";
import { useSessionStore } from "@/store/use-session-store";
import { useProfileStore } from "@/store/use-profile-store";
import { getProfile, upsertProfile } from "@/lib/db/profiles";
import { claimLegacyData, getSignedInUser, hasSeenWelcome, isGuest } from "@/lib/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthState = "pending" | "ready" | "error";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { userId, setUserId } = useSessionStore();
  const { profile, status, error, setStatus, setProfile, setError } = useProfileStore();
  const [authState, setAuthState] = useState<AuthState>("pending");

  // 1) Require an account. No session: the welcome slides (first visit) or log in. A guest journal
  //    from before accounts goes to sign-up, which attaches the new login to it so nothing is lost.
  useEffect(() => {
    let alive = true;
    fetch("/api/warm").catch(() => undefined);

    (async () => {
      try {
        const user = await getSignedInUser();
        if (!alive) return;
        if (!user) {
          router.replace(hasSeenWelcome() ? "/login" : "/welcome");
          return;
        }
        if (isGuest(user)) {
          router.replace("/signup?from=guest");
          return;
        }
        await claimLegacyData(user.id);
        if (!alive) return;
        setUserId(user.id);
        setAuthState("ready");
      } catch (err) {
        console.error(err);
        if (alive) setAuthState("error");
      }
    })();

    // Signing out in another tab (or the session expiring) returns this tab to log in.
    const { data: listener } = getSupabaseBrowserClient().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && alive) {
        setUserId(null);
        useProfileStore.getState().setProfile(null);
        router.replace("/login");
      }
    });

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, [router, setUserId]);

  // 2) Load the profile for the signed-in user.
  useEffect(() => {
    if (!userId) return;
    let alive = true;

    const loadProfile = async () => {
      if (profile && profile.user_id === userId) {
        setStatus("ready");
        const { error: syncError } = await upsertProfile({
          user_id: userId,
          name: profile.name,
          age: profile.age,
          occupation: profile.occupation ?? null,
          preferences: profile.preferences ?? {},
          created_at: profile.createdAt,
          updated_at: new Date().toISOString(),
        });
        if (syncError && alive) setError("We couldn't sync your profile yet.");
        return;
      }

      setStatus("loading");
      const { data, error: loadError } = await getProfile(userId);
      if (!alive) return;

      if (loadError) {
        setError("We couldn't load your profile yet. Refresh the page to try again.");
        setStatus("ready");
        return;
      }

      setProfile(
        data
          ? {
              user_id: data.user_id,
              name: data.name,
              age: data.age,
              occupation: data.occupation ?? undefined,
              username: data.username ?? null,
              preferences: data.preferences ?? {},
              createdAt: data.created_at ?? new Date().toISOString(),
            }
          : null
      );
      setStatus("ready");
    };

    loadProfile();
    return () => {
      alive = false;
    };
    // A cached profile from another (legacy) id is replaced by the database copy above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  let content: React.ReactNode;
  if (authState === "error") {
    content = (
      <div className="rounded-2xl border bg-card p-6 text-sm">
        <p className="font-medium text-foreground">We couldn&apos;t start your private session.</p>
        <p className="mt-1 text-muted-foreground">Check your connection and refresh the page.</p>
      </div>
    );
  } else if (authState === "pending" || status === "loading" || status === "idle") {
    content = <AppLoading />;
  } else {
    content = children;
  }

  return (
    <div className="min-h-screen bg-surface">
      <Sidebar activePath={pathname} />
      <div className="min-h-screen md:pl-64">
        <div className="flex min-h-screen flex-col gap-6">
          <div className="sticky top-0 z-30 border-b border-divider bg-surface/90 backdrop-blur">
            <div className="px-4 py-4 md:px-8">
              <TopHeader />
            </div>
          </div>
          {/* Extra bottom space on phones so the tab bar never covers the end of the page. */}
          <main className="flex-1 px-4 pb-28 md:px-8 md:pb-8">
            {content}
            {error && authState === "ready" && (
              <div className="mt-4 rounded-2xl border bg-card p-4 text-sm text-destructive">{error}</div>
            )}
          </main>
        </div>
      </div>
      {authState === "ready" && <OnboardingModal />}
    </div>
  );
}

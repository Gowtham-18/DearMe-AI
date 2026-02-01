"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import Sidebar from "@/components/sidebar";
import TopHeader from "@/components/top-header";
import OnboardingModal from "@/components/onboarding/OnboardingModal";
import AppLoading from "@/components/app-loading";
import { useSessionStore } from "@/store/use-session-store";
import { useProfileStore } from "@/store/use-profile-store";
import { getProfile, upsertProfile } from "@/lib/db/profiles";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ensureUserId } = useSessionStore();
  const { profile, status, error, setStatus, setProfile, setError } = useProfileStore();

  useEffect(() => {
    const userId = ensureUserId();
    let isMounted = true;

    const loadProfile = async () => {
      if (profile) {
        setStatus("ready");
        const { error } = await upsertProfile({
          user_id: profile.user_id,
          name: profile.name,
          age: profile.age,
          occupation: profile.occupation ?? null,
          created_at: profile.createdAt,
          updated_at: new Date().toISOString(),
        });
        if (error && isMounted) {
          setError("We couldn't sync your profile yet.");
        }
        return;
      }

      setStatus("loading");
      const { data, error } = await getProfile(userId);
      if (!isMounted) return;

      if (error) {
        setError("We couldn't load your profile yet. You can still continue locally.");
        setStatus("ready");
        return;
      }

      if (data) {
        setProfile({
          user_id: data.user_id,
          name: data.name,
          age: data.age,
          occupation: data.occupation ?? undefined,
          createdAt: data.created_at ?? new Date().toISOString(),
        });
      }

      setStatus("ready");
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [ensureUserId, profile, setError, setProfile, setStatus]);

  return (
    <div className="min-h-screen bg-muted/30">
      <Sidebar activePath={pathname} />
      <div className="min-h-screen md:pl-64">
        <div className="flex min-h-screen flex-col gap-6 px-4 py-6 md:px-8">
          <div className="sticky top-4 z-20">
            <TopHeader />
          </div>
          <main className="flex-1">
            {status === "loading" ? <AppLoading /> : children}
            {error && (
              <div className="mt-4 rounded-2xl border bg-card p-4 text-sm text-destructive">
                {error}
              </div>
            )}
          </main>
        </div>
      </div>
      <OnboardingModal />
    </div>
  );
}

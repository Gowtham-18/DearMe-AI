"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import Sidebar from "@/components/sidebar";
import TopHeader from "@/components/top-header";
import OnboardingModal from "@/components/onboarding-modal";
import { useSessionStore } from "@/store/use-session-store";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ensureUserId } = useSessionStore();

  useEffect(() => {
    ensureUserId();
  }, [ensureUserId]);

  return (
    <div className="min-h-screen bg-muted/30">
      <Sidebar activePath={pathname} />
      <div className="min-h-screen md:pl-64">
        <div className="flex min-h-screen flex-col gap-6 px-4 py-6 md:px-8">
          <div className="sticky top-4 z-20">
            <TopHeader />
          </div>
          <main className="flex-1">{children}</main>
        </div>
      </div>
      <OnboardingModal />
    </div>
  );
}

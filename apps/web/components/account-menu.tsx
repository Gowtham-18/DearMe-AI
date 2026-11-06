"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Shield, UserCircle2 } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getSignedInUser, signOut } from "@/lib/auth";
import { useProfileStore } from "@/store/use-profile-store";
import { useSessionStore } from "@/store/use-session-store";

export function initialsFor(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase() : "?";
}

/** Top-right account button: who's signed in, Account, Privacy & Safety, Log out. */
export default function AccountMenu() {
  const router = useRouter();
  const profile = useProfileStore((state) => state.profile);
  const setProfile = useProfileStore((state) => state.setProfile);
  const clearUserId = useSessionStore((state) => state.clearUserId);
  const [email, setEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    getSignedInUser().then((user) => setEmail(user?.email ?? null));
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    setProfile(null);
    clearUserId();
    router.replace("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        aria-label="Account menu"
      >
        <Avatar className="transition-shadow hover:ring-2 hover:ring-divider">
          <AvatarFallback>{initialsFor(profile?.name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="flex items-center gap-3 px-3 py-2.5">
          <Avatar>
            <AvatarFallback>{initialsFor(profile?.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{profile?.name ?? "Your account"}</p>
            {profile?.username && <p className="truncate text-xs text-muted-foreground">@{profile.username}</p>}
            {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/account")}>
          <UserCircle2 className="h-4 w-4 text-muted-foreground" /> Account
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/settings")}>
          <Shield className="h-4 w-4 text-muted-foreground" /> Privacy &amp; Safety
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut} disabled={signingOut} className="text-destructive data-[highlighted]:bg-destructive/10">
          <LogOut className="h-4 w-4" /> {signingOut ? "Logging out..." : "Log out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

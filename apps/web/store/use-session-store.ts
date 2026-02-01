import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { getOrCreateAnonymousUserId } from "@/lib/db/profiles";

interface SessionState {
  userId: string | null;
  ensureUserId: () => string;
  clearUserId: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      userId: null,
      ensureUserId: () => {
        const current = get().userId;
        if (current) {
          return current;
        }
        const next = getOrCreateAnonymousUserId();
        set({ userId: next });
        return next;
      },
      clearUserId: () => set({ userId: null }),
    }),
    {
      name: "dearme-session",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SessionState {
  userId: string | null;
  ensureUserId: () => void;
}

const createUserId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `anon_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      userId: null,
      ensureUserId: () => {
        if (!get().userId) {
          set({ userId: createUserId() });
        }
      },
    }),
    {
      name: "dearme-session",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

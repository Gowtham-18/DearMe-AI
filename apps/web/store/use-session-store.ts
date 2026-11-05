import { create } from "zustand";

interface SessionState {
  /** Supabase auth user id (anonymous or upgraded). Set by AppShell once sign-in completes. */
  userId: string | null;
  setUserId: (userId: string | null) => void;
  /** Returns the signed-in user's id. Pages render only after sign-in, so this is set. */
  ensureUserId: () => string;
  clearUserId: () => void;
}

export const useSessionStore = create<SessionState>()((set, get) => ({
  userId: null,
  setUserId: (userId) => set({ userId }),
  ensureUserId: () => get().userId ?? "",
  clearUserId: () => set({ userId: null }),
}));

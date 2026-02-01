import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface Profile {
  user_id: string;
  name: string;
  age: number;
  occupation?: string | null;
  createdAt: string;
}

type ProfileStatus = "idle" | "loading" | "ready" | "error";

interface ProfileState {
  profile: Profile | null;
  status: ProfileStatus;
  error: string | null;
  setProfile: (profile: Profile | null) => void;
  setStatus: (status: ProfileStatus) => void;
  setError: (error: string | null) => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      profile: null,
      status: "idle",
      error: null,
      setProfile: (profile) => set({ profile }),
      setStatus: (status) => set({ status }),
      setError: (error) => set({ error }),
    }),
    {
      name: "dearme-profile",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ profile: state.profile }),
    }
  )
);

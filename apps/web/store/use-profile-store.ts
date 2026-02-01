import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface Profile {
  name: string;
  age: number;
  occupation?: string;
  createdAt: string;
}

interface ProfileState {
  profile: Profile | null;
  hasHydrated: boolean;
  setProfile: (profile: Profile) => void;
  setHasHydrated: (value: boolean) => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      profile: null,
      hasHydrated: false,
      setProfile: (profile) => set({ profile }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: "dearme-profile",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

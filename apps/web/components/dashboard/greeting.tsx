"use client";

import { useMemo } from "react";

import { useProfileStore } from "@/store/use-profile-store";

const greetingForHour = (hour: number) => {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

export default function Greeting() {
  const { profile } = useProfileStore();
  const name = profile?.name ?? "Alex";

  const greeting = useMemo(() => greetingForHour(new Date().getHours()), []);

  return (
    <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
      {greeting}, {name}
    </h1>
  );
}

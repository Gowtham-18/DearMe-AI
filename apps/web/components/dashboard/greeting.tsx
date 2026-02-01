"use client";

import { useEffect, useState } from "react";

import { useProfileStore } from "@/store/use-profile-store";

const greetingForHour = (hour: number) => {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

export default function Greeting() {
  const { profile } = useProfileStore();
  const name = profile?.name ?? "there";
  const [greeting, setGreeting] = useState("Hello");

  useEffect(() => {
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  return (
    <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
      {greeting}, {name}
    </h1>
  );
}

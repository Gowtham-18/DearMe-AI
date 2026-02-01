import JournalChat from "@/components/journal/journal-chat";
import JournalSessions from "@/components/journal/journal-sessions";

export default function JournalPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
      <JournalSessions />
      <JournalChat />
    </div>
  );
}

import JournalForm from "@/components/journal/journal-form";
import JournalSidebar from "@/components/journal/journal-sidebar";

export default function JournalPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
      <JournalSidebar />
      <JournalForm />
    </div>
  );
}

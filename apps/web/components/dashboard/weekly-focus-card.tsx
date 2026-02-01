import { Card, CardContent } from "@/components/ui/card";

export default function WeeklyFocusCard() {
  return (
    <Card className="h-full border-none bg-gradient-to-br from-sky-500 to-sky-600 text-white shadow-soft">
      <CardContent className="flex h-full flex-col gap-4 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-white/80">AI Observation</p>
        <div>
          <h3 className="text-xl font-semibold">Weekly Focus</h3>
          <p className="mt-2 text-sm text-white/90">
            Your reflections show a steady desire for calm structure. Consider creating a
            lightweight ritual to transition between work and personal time.
          </p>
        </div>
        <div className="mt-auto rounded-2xl bg-white/15 p-4 text-sm">
          "A small, repeatable moment can anchor a full day of clarity."
        </div>
      </CardContent>
    </Card>
  );
}

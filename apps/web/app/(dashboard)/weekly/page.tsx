import { weeklyEvidence } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function WeeklyPage() {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        {[
          { title: "Focus", value: "Clarity" },
          { title: "Energy", value: "Steady" },
          { title: "Support", value: "Connection" },
        ].map((item) => (
          <Card key={item.title} className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">{item.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{item.value}</CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Evidence Cards</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {weeklyEvidence.map((item) => (
              <div key={item.title} className="rounded-2xl border bg-background p-4">
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Try this prompt next week</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            "When did I feel most like myself this week, and what was present in that moment?"
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

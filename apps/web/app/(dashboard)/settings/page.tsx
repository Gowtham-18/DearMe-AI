import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Privacy & Safety</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            Your journal entries are private. This app is designed to minimize data collection and
            store personal details only on your device.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline">Export data</Button>
            <Button variant="outline">Delete data</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Model limitations</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            AI insights are supportive but not perfect. Always verify important decisions with your
            own judgment.
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Safety note</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Not medical advice. If you are in crisis, contact local emergency services or a trusted
            professional.
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Crisis routing</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Placeholder: In future phases, we will provide regional crisis resources and a direct
          routing flow.
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Data minimization & consent</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          We collect the minimum metadata needed for personalization. You control what is stored,
          and you can export or delete your data at any time.
        </CardContent>
      </Card>
    </div>
  );
}

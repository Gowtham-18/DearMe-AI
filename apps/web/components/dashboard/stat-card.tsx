import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface StatCardProps {
  title: string;
  value: string;
  trend: string;
}

export default function StatCard({ title, value, trend }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <div className="text-2xl font-semibold">{value}</div>
        <Badge>{trend}</Badge>
      </CardContent>
    </Card>
  );
}
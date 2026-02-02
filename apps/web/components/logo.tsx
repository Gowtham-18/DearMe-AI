import { Sparkles } from "lucide-react";

export default function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <Sparkles className="h-4 w-4" />
      </div>
      <div>
        <p className="text-sm font-semibold">DearMe AI</p>
        <p className="text-xs text-muted-foreground">Journaling Companion</p>
      </div>
    </div>
  );
}

export default function CrisisResources() {
  return (
    <div
      role="alert"
      className="space-y-1.5 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-foreground"
    >
      <p className="font-medium">You don&apos;t have to go through this alone.</p>
      <p>If you&apos;re in immediate danger, call your local emergency number.</p>
      <p>
        In the US, call or text <strong>988</strong> (Suicide &amp; Crisis Lifeline). Elsewhere,{" "}
        <a href="https://findahelpline.com" target="_blank" rel="noreferrer" className="underline">
          findahelpline.com
        </a>{" "}
        lists free, confidential support lines.
      </p>
      <p className="text-xs text-muted-foreground">You can keep writing here whenever you&apos;re ready.</p>
    </div>
  );
}

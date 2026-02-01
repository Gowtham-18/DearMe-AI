export default function AppLoading() {
  return (
    <div className="space-y-6">
      <div className="h-6 w-48 animate-pulse rounded-full bg-muted" />
      <div className="h-10 w-80 animate-pulse rounded-2xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={idx} className="h-24 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

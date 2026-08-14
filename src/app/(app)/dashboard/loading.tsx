export default function DashboardLoading() {
  return (
    <main className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-6 p-4 md:p-6 lg:grid-cols-12">
      <aside className="space-y-4 lg:col-span-3">
        <div className="h-56 animate-pulse rounded-2xl border border-slate-800 bg-dark-900" />
        <div className="h-28 animate-pulse rounded-2xl border border-slate-800 bg-dark-900" />
      </aside>
      <section className="h-96 animate-pulse rounded-2xl border border-slate-800 bg-dark-900 lg:col-span-9" />
    </main>
  );
}

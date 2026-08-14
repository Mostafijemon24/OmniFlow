export default function StoreLoading() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-4 p-8">
      <div className="h-24 w-24 animate-pulse rounded-full bg-dark-800" />
      <div className="h-5 w-40 animate-pulse rounded bg-dark-800" />
      <div className="h-3 w-56 animate-pulse rounded bg-dark-800" />
      <div className="mt-6 h-24 w-full animate-pulse rounded-2xl bg-dark-800" />
      <div className="h-24 w-full animate-pulse rounded-2xl bg-dark-800" />
    </div>
  );
}

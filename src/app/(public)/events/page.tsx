import { PublicEventsList } from "@/features/events";

export default function EventsPage() {
  return (
    <section className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <p className="text-sm font-semibold text-alma-gold">COPA ALMA</p>
        <h1 className="mt-2 text-3xl font-bold text-white">大会一覧</h1>
        <p className="mt-3 max-w-3xl text-zinc-400">
          現在公開中の大会を確認し、受付中の大会へエントリーできます。
        </p>
      </div>
      <PublicEventsList />
    </section>
  );
}

export default function AdminDashboardPage() {
  return (
    <section>
      <p className="text-sm font-semibold text-alma-gold">管理メニュー</p>
      <h1 className="mt-2 text-2xl font-bold text-white">ダッシュボード</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
        大会運営に必要な主要指標と確認事項をまとめて表示します。
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {["受付中大会", "仮申込", "決済完了", "要確認"].map((label) => (
          <div
            key={label}
            className="rounded-lg border border-white/10 bg-white/[0.03] p-5"
          >
            <p className="text-sm text-zinc-400">{label}</p>
            <p className="mt-3 text-3xl font-bold text-white">0</p>
          </div>
        ))}
      </div>
    </section>
  );
}

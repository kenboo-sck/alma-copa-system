type AdminPlaceholderPageProps = {
  title: string;
  description: string;
  placeholder: string;
};

export function AdminPlaceholderPage({
  title,
  description,
  placeholder,
}: AdminPlaceholderPageProps) {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-alma-gold">管理メニュー</p>
        <h1 className="mt-2 text-2xl font-bold text-white">{title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
          {description}
        </p>
      </div>
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
        <p className="text-sm text-zinc-300">{placeholder}</p>
      </div>
    </section>
  );
}

import Link from "next/link";

const footerLinks: Array<{
  label: string;
  href: string;
  external?: boolean;
}> = [
  { label: "トップ", href: "/" },
  { label: "大会一覧", href: "/events" },
  { label: "特定商取引法に基づく表記", href: "/law" },
  { label: "プライバシーポリシー", href: "/legal/privacy" },
  { label: "利用規約", href: "/legal/terms" },
  { label: "お問い合わせ", href: "mailto:info@alma-copa.jp", external: true },
] as const;

function getBuildVersion() {
  const commit =
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_COMMIT_SHA ||
    process.env.COMMIT_SHA ||
    "";

  return commit ? commit.slice(0, 7) : "local";
}

export function SiteFooter() {
  const buildVersion = getBuildVersion();

  return (
    <footer className="border-t border-white/10 bg-[#050505] text-zinc-300">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.38em] text-alma-gold">
              COPA ALMA Entry System
            </p>
            <p className="mt-3 text-sm leading-7 text-zinc-400">
              ブラジリアン柔術大会のエントリー受付システムです。
            </p>
          </div>

          <nav aria-label="フッターリンク">
            <ul className="flex flex-col gap-3 text-sm text-zinc-400 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-3">
              {footerLinks.map((link) => (
                <li key={link.label}>
                  {link.external ? (
                    <a href={link.href} className="transition hover:text-alma-gold">
                      {link.label}
                    </a>
                  ) : (
                    <Link href={link.href} className="transition hover:text-alma-gold">
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <div className="border-t border-white/10 pt-6 text-xs text-zinc-500">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>© 2026 COPA ALMA. All Rights Reserved.</span>
              <span className="font-mono">build {buildVersion}</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

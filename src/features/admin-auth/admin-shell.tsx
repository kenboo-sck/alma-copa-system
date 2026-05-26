"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAdminAuth } from "./admin-auth-provider";

const navItems = [
  { label: "ダッシュボード", href: "/admin" },
  { label: "大会管理", href: "/admin/events" },
  { label: "エントリー", href: "/admin/entries" },
  { label: "選手管理", href: "/admin/participants" },
  { label: "決済", href: "/admin/payments" },
  { label: "受付", href: "/admin/reception" },
  { label: "お問い合わせ", href: "/admin/inquiries" },
  { label: "メール履歴", href: "/admin/email-logs" },
  { label: "設定", href: "/admin/settings" },
];

function LoadingState() {
  return (
    <div className="grid min-h-screen place-items-center bg-zinc-950 px-4 text-zinc-100">
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-alma-gold">
          COPA ALMA
        </p>
        <p className="mt-3 text-sm text-zinc-400">認証状態を確認しています。</p>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { adminUser, status, logout } = useAdminAuth();
  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    if (!isLoginPage && status === "unauthenticated") {
      router.replace("/admin/login");
    }
  }, [isLoginPage, router, status]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (status === "loading") {
    return <LoadingState />;
  }

  if (status !== "authenticated") {
    return <LoadingState />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-white/10 bg-zinc-950 px-4 py-5 lg:block">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-alma-gold">
            COPA ALMA
          </p>
          <p className="mt-1 text-sm text-zinc-400">管理コンソール</p>
        </div>
        <nav className="mt-8 space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/admin"
                ? pathname === item.href
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-md px-3 py-2 text-sm transition ${
                  isActive
                    ? "bg-alma-gold text-black"
                    : "text-zinc-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/90 px-4 py-4 backdrop-blur sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-white">管理画面</p>
              {adminUser ? (
                <p className="mt-1 text-xs text-zinc-500">
                  {adminUser.displayName || adminUser.email} / {adminUser.role}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:text-white"
              >
                公開ページ
              </Link>
              <button
                type="button"
                onClick={() => {
                  void logout().then(() => router.replace("/admin/login"));
                }}
                className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:border-alma-gold hover:text-alma-gold"
              >
                ログアウト
              </button>
            </div>
          </div>
          <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {navItems.map((item) => {
              const isActive =
                item.href === "/admin"
                  ? pathname === item.href
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`shrink-0 rounded-md px-3 py-2 text-sm transition ${
                    isActive
                      ? "bg-alma-gold text-black"
                      : "border border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

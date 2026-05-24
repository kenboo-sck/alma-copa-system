"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ArrowLeftIcon, HomeIcon, MenuIcon, TrophyIcon } from "@/components/icons";

const navLinks = [
  { label: "TOP", href: "/" },
  { label: "大会一覧", href: "/events" },
  { label: "ENTRY", href: "/events" },
  { label: "ABOUT", href: "/#howto" },
] as const;

function getEventId(pathname: string) {
  const match = pathname.match(/^\/events\/([^/]+)/);
  return match?.[1];
}

function getBreadcrumbs(pathname: string) {
  const eventId = getEventId(pathname);
  const crumbs = [{ label: "TOP", href: "/" }];

  if (pathname.startsWith("/events")) {
    crumbs.push({ label: "大会一覧", href: "/events" });
  }

  if (eventId) {
    crumbs.push({ label: "大会情報", href: `/events/${eventId}` });
  }

  if (pathname.includes("/entry")) {
    crumbs.push({ label: "ENTRY", href: `/events/${eventId}/entry` });
  }

  if (pathname.includes("/entry/individual")) {
    crumbs.push({ label: "個人申込", href: pathname });
  } else if (pathname.includes("/entry/representative")) {
    crumbs.push({ label: "代表者申込", href: pathname });
  } else if (pathname.includes("/confirm")) {
    crumbs.push({ label: "確認", href: pathname });
  } else if (pathname === "/payment/success" || pathname === "/entry/success") {
    crumbs.push({ label: "受付完了", href: pathname });
  } else if (pathname.startsWith("/legal")) {
    crumbs.push({ label: "LEGAL", href: pathname });
  } else if (pathname.startsWith("/payment") || pathname.startsWith("/entry/")) {
    crumbs.push({ label: "決済", href: pathname });
  }

  return crumbs;
}

function getBackLink(pathname: string) {
  const eventId = getEventId(pathname);

  if (
    pathname.includes("/entry/individual") ||
    pathname.includes("/entry/representative")
  ) {
    return { label: "ENTRYへ戻る", href: `/events/${eventId}/entry` };
  }

  if (pathname.includes("/entry") && eventId) {
    return { label: "大会情報へ戻る", href: `/events/${eventId}` };
  }

  if (eventId) {
    return { label: "大会一覧へ戻る", href: "/events" };
  }

  if (pathname !== "/") {
    return { label: "TOPへ戻る", href: "/" };
  }

  return null;
}

export function PublicNavigation() {
  const pathname = usePathname();
  const breadcrumbs = getBreadcrumbs(pathname);
  const backLink = getBackLink(pathname);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/58 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 w-full max-w-[1200px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="group flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-md border border-alma-gold/35 bg-alma-gold/10 text-alma-gold">
              <TrophyIcon size={18} />
            </span>
            <span>
              <span className="block text-sm font-black uppercase tracking-[0.28em] text-white transition group-hover:text-alma-gold">
                ALMA COPA
              </span>
              <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                Entry System
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-7 text-xs font-black uppercase tracking-[0.22em] text-zinc-300 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="transition hover:text-alma-gold"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <details className="relative md:hidden">
            <summary className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-md border border-white/10 bg-black/35 text-zinc-200 transition hover:border-alma-gold hover:text-alma-gold">
              <MenuIcon size={20} />
            </summary>
            <nav className="absolute right-0 mt-3 w-48 rounded-lg border border-white/10 bg-black/92 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="block rounded-md px-3 py-3 text-sm font-semibold text-zinc-300 transition hover:bg-alma-gold/10 hover:text-alma-gold"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </details>
        </div>
      </header>

      <div className="relative z-30 mx-auto w-full max-w-[1200px] px-4 pt-20 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <nav
            aria-label="パンくず"
            className="flex flex-wrap items-center gap-2 text-xs"
          >
            {breadcrumbs.map((crumb, index) => (
              <span key={`${crumb.href}-${index}`} className="flex items-center gap-2">
                {index > 0 ? <span className="text-zinc-700">/</span> : null}
                <Link
                  href={crumb.href}
                  className={
                    index === breadcrumbs.length - 1
                      ? "font-semibold text-alma-gold"
                      : "text-zinc-500 transition hover:text-zinc-200"
                  }
                >
                  {crumb.label}
                </Link>
              </span>
            ))}
          </nav>

          {backLink ? (
            <Link
              href={backLink.href}
              className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-400 transition hover:text-alma-gold"
            >
              <ArrowLeftIcon size={15} />
              {backLink.label}
            </Link>
          ) : null}
        </div>
      </div>

      <nav className="fixed bottom-4 right-4 z-50 flex gap-2 rounded-full border border-white/10 bg-black/70 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl md:hidden">
        <Link
          href="/"
          className="grid h-10 w-10 place-items-center rounded-full bg-white/8 text-zinc-200 transition hover:bg-alma-gold hover:text-black"
          aria-label="TOP"
        >
          <HomeIcon size={18} />
        </Link>
        <Link
          href="/events"
          className="grid h-10 w-10 place-items-center rounded-full bg-white/8 text-zinc-200 transition hover:bg-alma-gold hover:text-black"
          aria-label="大会一覧"
        >
          <TrophyIcon size={18} />
        </Link>
        {backLink ? (
          <Link
            href={backLink.href}
            className="grid h-10 w-10 place-items-center rounded-full bg-alma-gold text-black transition hover:bg-[#e0be58]"
            aria-label={backLink.label}
          >
            <ArrowLeftIcon size={18} />
          </Link>
        ) : null}
      </nav>
    </>
  );
}

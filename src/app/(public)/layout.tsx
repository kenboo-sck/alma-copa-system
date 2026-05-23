import { PublicNavigation } from "@/components/public-navigation";
import { SiteFooter } from "@/components/site-footer";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-alma-black text-alma-ivory">
      <PublicNavigation />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}

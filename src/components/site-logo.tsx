import Image from "next/image";

type SiteLogoProps = {
  className?: string;
};

export const siteLogoPath = "/images/alma-logo.svg";

export function SiteLogo({ className = "" }: SiteLogoProps) {
  return (
    <Image
      src={siteLogoPath}
      alt="COPA ALMA"
      width={414}
      height={331}
      className={`block h-auto object-contain ${className}`.trim()}
      loading="eager"
      style={{ height: "auto", objectFit: "contain" }}
    />
  );
}

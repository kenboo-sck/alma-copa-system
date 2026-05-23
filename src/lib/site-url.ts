const PRODUCTION_SITE_URL = "https://copa-alma.com";

export function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    PRODUCTION_SITE_URL
  ).replace(/\/+$/, "");
}

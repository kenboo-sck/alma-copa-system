import type { Metadata } from "next";

import { TokushoTablePage } from "@/components/tokusho-table-page";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記",
  description:
    "COPA ALMA の大会エントリー受付に関する特定商取引法に基づく表記です。販売業者、支払方法、キャンセル・返金規定等を掲載しています。",
};

export default function LawPage() {
  return <TokushoTablePage />;
}

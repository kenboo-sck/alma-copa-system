import {
  DIVISION_LABELS,
  calculateEntryFees,
  type AthleteInput,
} from "@/lib/entries/entry-divisions";

function formatYen(value: number) {
  return `${value.toLocaleString("ja-JP")}円`;
}

type EntryFeeBreakdownProps = {
  entryFee: number;
  priceLabel: string;
  athletes: AthleteInput[];
  // 代表者エントリーでは選手ごとに見出しを付ける。
  showAthleteHeadings: boolean;
};

// 料金内訳（部門ごとの参加費＋無差別級）。入力フォームと確認画面で共用する。
// 表示用の計算であり、決済金額はサーバー側で同じ計算式から算出する。
export function EntryFeeBreakdown({
  entryFee,
  priceLabel,
  athletes,
  showAthleteHeadings,
}: EntryFeeBreakdownProps) {
  const summary = calculateEntryFees(entryFee, athletes);

  return (
    <div className="space-y-3">
      {summary.athletes.map((fee, index) => (
        <div
          key={index}
          className="rounded-md border border-white/10 bg-black/30 px-4 py-3 text-sm"
        >
          {showAthleteHeadings ? (
            <p className="mb-2 font-bold text-white">
              選手{index + 1}
              {athletes[index]?.name ? `：${athletes[index].name}` : ""}
            </p>
          ) : null}
          {fee.divisions.length === 0 ? (
            <p className="text-zinc-400">出場部門が未選択です。</p>
          ) : (
            <ul className="space-y-1.5">
              {fee.divisions.map((division) => (
                <li key={division} className="flex justify-between gap-4 text-zinc-200">
                  <span>
                    {DIVISION_LABELS[division]} 参加費（{priceLabel}）
                  </span>
                  <span className="font-semibold">{formatYen(summary.entryFee)}</span>
                </li>
              ))}
              {fee.openClassDivisions.map((division) => (
                <li
                  key={`${division}-open`}
                  className="flex justify-between gap-4 text-zinc-200"
                >
                  <span>{DIVISION_LABELS[division]} 無差別級</span>
                  <span className="font-semibold">
                    {formatYen(summary.openClassFee)}
                  </span>
                </li>
              ))}
              {showAthleteHeadings ? (
                <li className="flex justify-between gap-4 border-t border-white/10 pt-1.5 text-zinc-400">
                  <span>小計</span>
                  <span className="font-semibold text-white">
                    {formatYen(fee.total)}
                  </span>
                </li>
              ) : null}
            </ul>
          )}
        </div>
      ))}

      <div className="flex items-end justify-between gap-4 border-t border-alma-gold/30 pt-3">
        <div className="text-xs leading-5 text-zinc-400">
          <p>
            参加費 {formatYen(summary.entryFee)} × {summary.divisionEntryCount}部門
          </p>
          {summary.openClassEntryCount > 0 ? (
            <p>
              無差別級 {formatYen(summary.openClassFee)} × {summary.openClassEntryCount}
              件
            </p>
          ) : null}
        </div>
        <p className="text-3xl font-black text-white">
          合計: {formatYen(summary.totalAmount)}
        </p>
      </div>
    </div>
  );
}

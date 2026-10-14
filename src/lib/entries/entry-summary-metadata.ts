// Stripe Checkout Session の metadata に出場内容の要約を載せるための変換。
// サーバーはログインなしでエントリーを読み戻せないため、決済完了メールに載せる
// 出場内容は、決済開始時にサーバーが作った要約を metadata 経由で受け渡す。
// Stripe の制限（値は 500 文字まで、キーは 50 個まで）に収まるよう分割する。

const SUMMARY_KEY_PREFIX = "entrySummary";
const MAX_VALUE_LENGTH = 450;
const MAX_CHUNKS = 30;

export function packEntrySummaryMetadata(lines: string[]): Record<string, string> {
  const chunks: string[] = [];
  let omitted = 0;

  for (const line of lines) {
    const safeLine = line.slice(0, MAX_VALUE_LENGTH);
    const last = chunks[chunks.length - 1];

    if (last !== undefined && last.length + 1 + safeLine.length <= MAX_VALUE_LENGTH) {
      chunks[chunks.length - 1] = `${last}\n${safeLine}`;
    } else if (chunks.length < MAX_CHUNKS) {
      chunks.push(safeLine);
    } else {
      omitted += 1;
    }
  }

  const metadata: Record<string, string> = {};
  chunks.forEach((chunk, index) => {
    metadata[`${SUMMARY_KEY_PREFIX}${index}`] = chunk;
  });

  if (omitted > 0) {
    metadata[`${SUMMARY_KEY_PREFIX}Omitted`] = String(omitted);
  }

  return metadata;
}

export function unpackEntrySummaryMetadata(
  metadata: Record<string, string> | null | undefined,
): string[] {
  if (!metadata) {
    return [];
  }

  const lines: string[] = [];

  for (let index = 0; index < MAX_CHUNKS; index += 1) {
    const chunk = metadata[`${SUMMARY_KEY_PREFIX}${index}`];
    if (typeof chunk !== "string" || !chunk) {
      break;
    }
    lines.push(...chunk.split("\n"));
  }

  const omitted = Number(metadata[`${SUMMARY_KEY_PREFIX}Omitted`] ?? 0);
  if (omitted > 0) {
    lines.push(`ほか${omitted}件（管理画面でご確認ください）`);
  }

  return lines;
}

// metadata から、メールに載せる出場内容と合計金額を取り出す。
export function getEntryEmailDetailsFromMetadata(
  metadata: Record<string, string> | null | undefined,
): { entryDetailLines?: string[]; totalAmount?: number } {
  const entryDetailLines = unpackEntrySummaryMetadata(metadata);
  const totalAmount = Number(metadata?.totalAmount);

  return {
    ...(entryDetailLines.length > 0 ? { entryDetailLines } : {}),
    ...(Number.isFinite(totalAmount) && totalAmount > 0 ? { totalAmount } : {}),
  };
}

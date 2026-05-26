export const inquiryReplySubject = "【COPA ALMA】お問い合わせへのご返信";

export function inquiryReplyTemplate() {
  return [
    "お問い合わせありがとうございます。",
    "",
    "ALMA COPA 運営事務局です。",
    "",
    "お問い合わせ内容を確認いたしました。",
    "以下、ご返信いたします。",
    "",
    "--------------------",
    "",
    "（ここに返信）",
    "",
    "--------------------",
    "",
    "よろしくお願いいたします。",
  ].join("\n");
}

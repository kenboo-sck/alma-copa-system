import "server-only";

import type { EmailSendResult, EntryEmailMessage, EntryEmailPayload } from "./types";

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_MAIL_PROVIDER = "resend";

type MailProvider = "php" | "resend";

export type EmailEnvironmentStatus = {
  isConfigured: boolean;
  provider: MailProvider;
  missingKeys: string[];
  warnings: string[];
  fromAddress: string;
  phpMailApiUrl?: string;
};

function getMailProvider(): MailProvider {
  return process.env.MAIL_PROVIDER === "php" ? "php" : DEFAULT_MAIL_PROVIDER;
}

function getFromAddress() {
  return process.env.MAIL_FROM_ADDRESS || "ALMA COPA <onboarding@resend.dev>";
}

function getApiKey() {
  return process.env.MAIL_PROVIDER_API_KEY ?? "";
}

function getAdminEmail() {
  return process.env.ADMIN_NOTIFICATION_EMAIL ?? "";
}

function getPhpMailApiUrl() {
  return process.env.PHP_MAIL_API_URL ?? "";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function textToHtml(value: string) {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

function parseJsonBody(value: string) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getBodyString(body: Record<string, unknown> | null, key: string) {
  const value = body?.[key];
  return typeof value === "string" ? value : undefined;
}

function getEnvironmentStatus(): EmailEnvironmentStatus {
  const provider = getMailProvider();
  const missingKeys: string[] = [];

  if (provider === "resend" && !process.env.MAIL_PROVIDER_API_KEY) {
    missingKeys.push("MAIL_PROVIDER_API_KEY");
  }
  if (!process.env.ADMIN_NOTIFICATION_EMAIL) {
    missingKeys.push("ADMIN_NOTIFICATION_EMAIL");
  }
  if (provider === "php" && !process.env.PHP_MAIL_API_URL) {
    missingKeys.push("PHP_MAIL_API_URL");
  }

  const warnings: string[] = [];
  if (
    provider === "resend" &&
    process.env.MAIL_PROVIDER_API_KEY &&
    process.env.MAIL_PROVIDER_API_KEY.length < 20
  ) {
    warnings.push("MAIL_PROVIDER_API_KEY が短すぎます。");
  }
  if (provider === "resend" && getFromAddress().includes("onboarding@resend.dev")) {
    warnings.push(
      "MAIL_FROM_ADDRESS が Resend の初期送信元です。独自ドメイン運用では verified domain の from を設定してください。",
    );
  }
  return {
    isConfigured: missingKeys.length === 0,
    provider,
    missingKeys,
    warnings,
    fromAddress: getFromAddress(),
    phpMailApiUrl: provider === "php" ? getPhpMailApiUrl() : undefined,
  };
}

function getEntryTypeLabel(entryType: EntryEmailPayload["entryType"]) {
  return entryType === "individual" ? "個人エントリー" : "代表者エントリー";
}

function buildApplicantEmail(payload: EntryEmailPayload) {
  const subject = `【ALMA COPA】エントリー受付完了: ${payload.eventTitle}`;
  const applicantName = escapeHtml(payload.applicantName);
  const eventTitle = escapeHtml(payload.eventTitle);
  const entryTypeLabel = getEntryTypeLabel(payload.entryType);
  const contactEmail = "info@copa-alma.com";
  const text = [
    `${payload.applicantName} 様`,
    "",
    "この度はALMA COPAへエントリーいただき、誠にありがとうございます。",
    "大会運営にて、以下の内容でエントリーを受付いたしました。",
    "",
    `大会名: ${payload.eventTitle}`,
    `申込区分: ${entryTypeLabel}`,
    "",
    "今後の流れ",
    "1. 大会当日に向け、運営より順次ご案内をお送りいたします。",
    "2. 受付・集合時間・注意事項などは、確定次第メールまたは公式案内にてご連絡いたします。",
    "3. 当日は時間に余裕をもって会場へお越しください。",
    "",
    "ご不明点がございましたらお気軽にお問い合わせください。",
    `お問い合わせ: ${contactEmail}`,
    "",
    "ALMA COPA 運営事務局",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <!doctype html>
    <html lang="ja">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="x-apple-disable-message-reformatting">
        <title>${escapeHtml(subject)}</title>
      </head>
      <body style="margin:0;padding:0;background-color:#090909;color:#f7f3e8;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;-webkit-text-size-adjust:100%;text-size-adjust:100%;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
          ALMA COPAへのエントリーを大会運営にて受付いたしました。
        </div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0;padding:0;background-color:#090909;border-collapse:collapse;">
          <tr>
            <td align="center" style="padding:28px 12px;">
              <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse;">
                <tr>
                  <td style="padding:0 0 16px 0;text-align:center;">
                    <div style="font-size:28px;line-height:1.1;font-weight:700;letter-spacing:3px;color:#d6b25e;">ALMA COPA</div>
                    <div style="margin-top:8px;font-size:12px;line-height:1.5;letter-spacing:2px;color:#8f8776;">TOURNAMENT ENTRY</div>
                  </td>
                </tr>
                <tr>
                  <td style="background-color:#111111;border:1px solid #3a2f18;border-radius:14px;overflow:hidden;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
                      <tr>
                        <td style="padding:0;background-color:#d6b25e;height:4px;font-size:0;line-height:0;">&nbsp;</td>
                      </tr>
                      <tr>
                        <td style="padding:30px 26px 18px 26px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
                            <tr>
                              <td style="padding:0 0 18px 0;">
                                <span style="display:inline-block;padding:7px 12px;border-radius:999px;background-color:#2a2110;border:1px solid #d6b25e;color:#f6dc98;font-size:12px;line-height:1;font-weight:700;letter-spacing:1px;">受付完了</span>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:0;">
                                <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.35;font-weight:700;letter-spacing:0;">エントリーを受付いたしました</h1>
                                <p style="margin:18px 0 0 0;color:#d9d2c2;font-size:15px;line-height:1.9;">
                                  ${applicantName} 様<br>
                                  この度はALMA COPAへエントリーいただき、誠にありがとうございます。大会運営にて、以下の内容でしっかりと受付いたしました。
                                </p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0 26px 24px 26px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;background-color:#171717;border:1px solid #2c2c2c;border-radius:10px;">
                            <tr>
                              <td style="padding:18px 18px 8px 18px;color:#d6b25e;font-size:13px;line-height:1.5;font-weight:700;letter-spacing:1px;">ENTRY DETAILS</td>
                            </tr>
                            <tr>
                              <td style="padding:0 18px 18px 18px;">
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
                                  <tr>
                                    <td style="padding:12px 0;border-top:1px solid #2c2c2c;color:#9f9a90;font-size:13px;line-height:1.6;width:34%;">氏名</td>
                                    <td style="padding:12px 0;border-top:1px solid #2c2c2c;color:#ffffff;font-size:15px;line-height:1.6;font-weight:700;">${applicantName}</td>
                                  </tr>
                                  <tr>
                                    <td style="padding:12px 0;border-top:1px solid #2c2c2c;color:#9f9a90;font-size:13px;line-height:1.6;width:34%;">大会名</td>
                                    <td style="padding:12px 0;border-top:1px solid #2c2c2c;color:#ffffff;font-size:15px;line-height:1.6;font-weight:700;">${eventTitle}</td>
                                  </tr>
                                  <tr>
                                    <td style="padding:12px 0;border-top:1px solid #2c2c2c;color:#9f9a90;font-size:13px;line-height:1.6;width:34%;">申込区分</td>
                                    <td style="padding:12px 0;border-top:1px solid #2c2c2c;color:#ffffff;font-size:15px;line-height:1.6;font-weight:700;">${entryTypeLabel}</td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0 26px 26px 26px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
                            <tr>
                              <td style="padding:0 0 10px 0;color:#d6b25e;font-size:16px;line-height:1.6;font-weight:700;">今後の流れ</td>
                            </tr>
                            <tr>
                              <td style="padding:0;">
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
                                  <tr>
                                    <td valign="top" style="padding:10px 0;width:28px;color:#d6b25e;font-size:15px;line-height:1.8;font-weight:700;">1</td>
                                    <td style="padding:10px 0;color:#d9d2c2;font-size:14px;line-height:1.8;">大会当日に向け、運営より順次ご案内をお送りいたします。</td>
                                  </tr>
                                  <tr>
                                    <td valign="top" style="padding:10px 0;border-top:1px solid #242424;width:28px;color:#d6b25e;font-size:15px;line-height:1.8;font-weight:700;">2</td>
                                    <td style="padding:10px 0;border-top:1px solid #242424;color:#d9d2c2;font-size:14px;line-height:1.8;">受付・集合時間・注意事項などは、確定次第メールまたは公式案内にてご連絡いたします。</td>
                                  </tr>
                                  <tr>
                                    <td valign="top" style="padding:10px 0;border-top:1px solid #242424;width:28px;color:#d6b25e;font-size:15px;line-height:1.8;font-weight:700;">3</td>
                                    <td style="padding:10px 0;border-top:1px solid #242424;color:#d9d2c2;font-size:14px;line-height:1.8;">当日は時間に余裕をもって会場へお越しください。</td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0 26px 30px 26px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;background-color:#1b160b;border:1px solid #4a3918;border-radius:10px;">
                            <tr>
                              <td style="padding:18px;color:#f2e2ba;font-size:14px;line-height:1.9;">
                                ご不明点がございましたらお気軽にお問い合わせください。大会当日に向けて、安心してご参加いただけるよう運営一同準備を進めてまいります。
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 8px 0 8px;text-align:center;color:#8f8776;font-size:12px;line-height:1.8;">
                    お問い合わせ：<a href="mailto:${contactEmail}" style="color:#d6b25e;text-decoration:none;">${contactEmail}</a><br>
                    ALMA COPA 運営事務局
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return { subject, text, html };
}

function buildAdminEmail(payload: EntryEmailPayload) {
  const subject = `【ALMA COPA】新規エントリー受付: ${payload.eventTitle}`;
  const text = [
    "管理者各位",
    "",
    "新しいエントリーが完了しました。",
    `大会名: ${payload.eventTitle}`,
    `申込者: ${payload.applicantName}`,
    `メール: ${payload.applicantEmail}`,
    `申込種別: ${getEntryTypeLabel(payload.entryType)}`,
    `決済状態: ${payload.paymentStatus}`,
    payload.sessionId ? `Stripe Session ID: ${payload.sessionId}` : "",
    `Entry ID: ${payload.entryId}`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.7;color:#111827">
      <p>管理者各位</p>
      <p>新しいエントリーが完了しました。</p>
      <ul>
        <li>大会名: ${escapeHtml(payload.eventTitle)}</li>
        <li>申込者: ${escapeHtml(payload.applicantName)}</li>
        <li>メール: ${escapeHtml(payload.applicantEmail)}</li>
        <li>申込種別: ${getEntryTypeLabel(payload.entryType)}</li>
        <li>決済状態: ${escapeHtml(payload.paymentStatus)}</li>
        ${payload.sessionId ? `<li>Stripe Session ID: ${escapeHtml(payload.sessionId)}</li>` : ""}
        <li>Entry ID: ${escapeHtml(payload.entryId)}</li>
      </ul>
    </div>
  `;

  return { subject, text, html };
}

function buildEntryEmailMessages(payload: EntryEmailPayload): EntryEmailMessage[] {
  const adminEmail = getAdminEmail();
  const applicant = buildApplicantEmail(payload);
  const admin = buildAdminEmail(payload);

  return [
    {
      recipientEmail: payload.applicantEmail,
      recipientName: payload.applicantName,
      recipientType: "user",
      ...applicant,
    },
    {
      recipientEmail: adminEmail,
      recipientName: "ALMA COPA 管理者",
      recipientType: "admin",
      ...admin,
    },
  ];
}

function buildManualEmail(input: { subject: string; body: string }) {
  const escapedSubject = escapeHtml(input.subject);
  const htmlBody = textToHtml(input.body);
  const html = `
    <!doctype html>
    <html lang="ja">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escapedSubject}</title>
      </head>
      <body style="margin:0;padding:0;background-color:#090909;color:#f7f3e8;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#090909;border-collapse:collapse;">
          <tr>
            <td align="center" style="padding:28px 12px;">
              <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse;">
                <tr>
                  <td style="padding:0 0 16px 0;text-align:center;">
                    <div style="font-size:28px;line-height:1.1;font-weight:700;letter-spacing:3px;color:#d6b25e;">ALMA COPA</div>
                  </td>
                </tr>
                <tr>
                  <td style="background-color:#111111;border:1px solid #3a2f18;border-radius:14px;overflow:hidden;">
                    <div style="height:4px;background-color:#d6b25e;font-size:0;line-height:0;">&nbsp;</div>
                    <div style="padding:28px 26px;">
                      <h1 style="margin:0;color:#ffffff;font-size:24px;line-height:1.4;font-weight:700;">${escapedSubject}</h1>
                      <div style="margin-top:20px;color:#d9d2c2;font-size:15px;line-height:1.9;">${htmlBody}</div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 8px 0 8px;text-align:center;color:#8f8776;font-size:12px;line-height:1.8;">
                    ALMA COPA 運営事務局
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return {
    subject: input.subject,
    text: input.body,
    html,
  };
}

export class EmailProviderError extends Error {
  constructor(
    message: string,
    readonly details: {
      provider: MailProvider;
      status: number;
      statusText: string;
      body: unknown;
      recipient: string;
    },
  ) {
    super(message);
    this.name = "EmailProviderError";
  }
}

async function sendSingleEmail(
  to: string,
  subject: string,
  text: string,
  html: string,
): Promise<EmailSendResult> {
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getFromAddress(),
      to,
      subject,
      text,
      html,
    }),
  });

  const bodyText = await response.text().catch(() => "");
  const data = parseJsonBody(bodyText);

  if (!response.ok) {
    throw new EmailProviderError(
      getBodyString(data, "error") ||
        `Email API request failed with status ${response.status}`,
      {
        provider: "resend",
        status: response.status,
        statusText: response.statusText,
        body: data ?? bodyText,
        recipient: to,
      },
    );
  }

  return {
    ok: true,
    provider: "resend",
    recipient: to,
    id: getBodyString(data, "id"),
  };
}

async function sendPhpEmail(
  to: string,
  subject: string,
  text: string,
  html: string,
): Promise<EmailSendResult> {
  const phpMailApiUrl = getPhpMailApiUrl();
  console.info("PHP mail API request started", {
    url: phpMailApiUrl,
    recipient: to,
    subject,
  });

  const response = await fetch(phpMailApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to,
      subject,
      html,
      text,
    }),
  });

  const bodyText = await response.text().catch(() => "");
  const data = parseJsonBody(bodyText);
  const isSuccess = data?.success === true;

  if (!response.ok || !isSuccess) {
    console.error("PHP mail API request failed", {
      url: phpMailApiUrl,
      recipient: to,
      status: response.status,
      statusText: response.statusText,
      body: data ?? bodyText,
      bodyText,
    });

    throw new EmailProviderError(
      getBodyString(data, "error") ||
        `PHP mail API request failed with status ${response.status}`,
      {
        provider: "php",
        status: response.status,
        statusText: response.statusText,
        body: data ?? bodyText,
        recipient: to,
      },
    );
  }

  return {
    ok: true,
    provider: "php",
    recipient: to,
    id: getBodyString(data, "id"),
  };
}

async function sendPhpEntryEmails(
  payload: EntryEmailPayload,
): Promise<EmailSendResult[]> {
  const messages = buildEntryEmailMessages(payload);

  const results: EmailSendResult[] = [];

  for (const message of messages) {
    results.push(
      await sendPhpEmail(
        message.recipientEmail,
        message.subject,
        message.text,
        message.html,
      ),
    );
  }

  return results;
}

export class EmailService {
  getEnvironmentStatus() {
    return getEnvironmentStatus();
  }

  getEntryEmailMessages(payload: EntryEmailPayload) {
    return buildEntryEmailMessages(payload);
  }

  async sendEntryEmails(payload: EntryEmailPayload): Promise<EmailSendResult[]> {
    const status = this.getEnvironmentStatus();

    if (!status.isConfigured) {
      throw new Error(
        `Email service is not configured. Missing: ${status.missingKeys.join(", ")}`,
      );
    }

    const adminEmail = getAdminEmail();
    if (!adminEmail) {
      throw new Error("ADMIN_NOTIFICATION_EMAIL is not configured.");
    }

    if (status.provider === "php") {
      return sendPhpEntryEmails(payload);
    }

    const messages = buildEntryEmailMessages(payload);

    const results: EmailSendResult[] = [];

    for (const message of messages) {
      results.push(
        await sendSingleEmail(
          message.recipientEmail,
          message.subject,
          message.text,
          message.html,
        ),
      );
    }

    return results;
  }

  async sendManualEmail(input: {
    recipientEmail: string;
    subject: string;
    body: string;
  }): Promise<EmailSendResult> {
    const status = this.getEnvironmentStatus();

    if (!status.isConfigured) {
      throw new Error(
        `Email service is not configured. Missing: ${status.missingKeys.join(", ")}`,
      );
    }

    const message = buildManualEmail({
      subject: input.subject,
      body: input.body,
    });

    if (status.provider === "php") {
      return sendPhpEmail(
        input.recipientEmail,
        message.subject,
        message.text,
        message.html,
      );
    }

    return sendSingleEmail(
      input.recipientEmail,
      message.subject,
      message.text,
      message.html,
    );
  }
}

export const emailService = new EmailService();

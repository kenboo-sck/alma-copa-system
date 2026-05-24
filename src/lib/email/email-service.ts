import "server-only";

import type { EmailSendResult, EntryEmailPayload } from "./types";

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
    warnings.push("MAIL_FROM_ADDRESS が Resend の初期送信元です。独自ドメイン運用では verified domain の from を設定してください。");
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

function buildApplicantEmail(payload: EntryEmailPayload) {
  const subject = `【ALMA COPA】エントリー受付完了: ${payload.eventTitle}`;
  const text = [
    `${payload.applicantName} 様`,
    "",
    "ALMA COPA のエントリー受付が完了しました。",
    `大会名: ${payload.eventTitle}`,
    `申込種別: ${payload.entryType === "individual" ? "個人" : "代表者"}`,
    `決済状態: ${payload.paymentStatus}`,
    payload.sessionId ? `Stripe Session ID: ${payload.sessionId}` : "",
    "",
    "引き続き大会運営からの案内をご確認ください。",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.7;color:#111827">
      <p>${escapeHtml(payload.applicantName)} 様</p>
      <p>ALMA COPA のエントリー受付が完了しました。</p>
      <ul>
        <li>大会名: ${escapeHtml(payload.eventTitle)}</li>
        <li>申込種別: ${payload.entryType === "individual" ? "個人" : "代表者"}</li>
        <li>決済状態: ${escapeHtml(payload.paymentStatus)}</li>
        ${payload.sessionId ? `<li>Stripe Session ID: ${escapeHtml(payload.sessionId)}</li>` : ""}
      </ul>
      <p>引き続き大会運営からの案内をご確認ください。</p>
    </div>
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
    `申込種別: ${payload.entryType === "individual" ? "個人" : "代表者"}`,
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
        <li>申込種別: ${payload.entryType === "individual" ? "個人" : "代表者"}</li>
        <li>決済状態: ${escapeHtml(payload.paymentStatus)}</li>
        ${payload.sessionId ? `<li>Stripe Session ID: ${escapeHtml(payload.sessionId)}</li>` : ""}
        <li>Entry ID: ${escapeHtml(payload.entryId)}</li>
      </ul>
    </div>
  `;

  return { subject, text, html };
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

async function sendSingleEmail(to: string, subject: string, text: string, html: string): Promise<EmailSendResult> {
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
    throw new EmailProviderError(getBodyString(data, "error") || `Email API request failed with status ${response.status}`, {
      provider: "resend",
      status: response.status,
      statusText: response.statusText,
      body: data ?? bodyText,
      recipient: to,
    });
  }

  return {
    ok: true,
    provider: "resend",
    recipient: to,
    id: getBodyString(data, "id"),
  };
}

async function sendPhpEmail(to: string, subject: string, text: string, html: string): Promise<EmailSendResult> {
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

    throw new EmailProviderError(getBodyString(data, "error") || `PHP mail API request failed with status ${response.status}`, {
      provider: "php",
      status: response.status,
      statusText: response.statusText,
      body: data ?? bodyText,
      recipient: to,
    });
  }

  return {
    ok: true,
    provider: "php",
    recipient: to,
    id: getBodyString(data, "id"),
  };
}

async function sendPhpEntryEmails(payload: EntryEmailPayload): Promise<EmailSendResult[]> {
  const adminEmail = getAdminEmail();
  const applicant = buildApplicantEmail(payload);
  const admin = buildAdminEmail(payload);

  const results: EmailSendResult[] = [];

  results.push(await sendPhpEmail(payload.applicantEmail, applicant.subject, applicant.text, applicant.html));
  results.push(await sendPhpEmail(adminEmail, admin.subject, admin.text, admin.html));

  return results;
}

export class EmailService {
  getEnvironmentStatus() {
    return getEnvironmentStatus();
  }

  async sendEntryEmails(payload: EntryEmailPayload): Promise<EmailSendResult[]> {
    const status = this.getEnvironmentStatus();

    if (!status.isConfigured) {
      throw new Error(`Email service is not configured. Missing: ${status.missingKeys.join(", ")}`);
    }

    const adminEmail = getAdminEmail();
    if (!adminEmail) {
      throw new Error("ADMIN_NOTIFICATION_EMAIL is not configured.");
    }

    if (status.provider === "php") {
      return sendPhpEntryEmails(payload);
    }

    const applicant = buildApplicantEmail(payload);
    const admin = buildAdminEmail(payload);

    const results: EmailSendResult[] = [];

    results.push(await sendSingleEmail(payload.applicantEmail, applicant.subject, applicant.text, applicant.html));
    results.push(await sendSingleEmail(adminEmail, admin.subject, admin.text, admin.html));

    return results;
  }
}

export const emailService = new EmailService();

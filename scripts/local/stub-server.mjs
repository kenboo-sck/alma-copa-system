// ローカル検証用の代替サーバー。外部へは一切通信しない。
//   - メール: アプリが送信しようとしたメールを受け取り、一覧表示する（実際には送信しない）
//   - Stripe: Checkout Session の作成・取得に応答し、テスト用の決済ページを表示する
// テスト決済を完了すると、アプリの Webhook へ（本物と同じ方式で）署名付きの通知を送る。
import { createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";

import { APP_URL, STRIPE_WEBHOOK_SECRET, STUB_PORT, STUB_URL } from "./env.mjs";

const mails = [];
const sessions = new Map();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function readBody(request) {
  return new Promise((resolve) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => resolve(body));
  });
}

function send(response, status, body, contentType = "application/json") {
  response.writeHead(status, { "Content-Type": `${contentType}; charset=utf-8` });
  response.end(typeof body === "string" ? body : JSON.stringify(body));
}

function page(title, content) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:860px;margin:32px auto;padding:0 16px;line-height:1.7;color:#1f2937}
h1{font-size:22px}h2{font-size:16px;margin-top:32px}pre{background:#f3f4f6;padding:12px;border-radius:8px;white-space:pre-wrap;word-break:break-word}
.card{border:1px solid #d1d5db;border-radius:8px;padding:12px 16px;margin:12px 0}.muted{color:#6b7280;font-size:13px}
button{font-size:15px;padding:10px 18px;border-radius:8px;border:1px solid #111827;background:#111827;color:#fff;cursor:pointer}
button.secondary{background:#fff;color:#111827}</style></head><body>${content}</body></html>`;
}

// Stripe SDK は application/x-www-form-urlencoded で "a[b][c]=1" の形式を送る。
function parseStripeForm(body) {
  const result = {};

  for (const [rawKey, value] of new URLSearchParams(body)) {
    const path = rawKey.replaceAll("]", "").split("[");
    let target = result;

    path.forEach((key, index) => {
      if (index === path.length - 1) {
        target[key] = value;
      } else {
        target[key] ??= {};
        target = target[key];
      }
    });
  }

  return result;
}

function toStripeSession(session, expandPaymentIntent) {
  const paymentIntentId = session.paid ? `pi_local_${session.id.slice(-12)}` : null;

  return {
    id: session.id,
    object: "checkout.session",
    mode: "payment",
    url: `${STUB_URL}/checkout/${session.id}`,
    status: session.paid ? "complete" : "open",
    payment_status: session.paid ? "paid" : "unpaid",
    amount_total: session.amount,
    currency: session.currency,
    client_reference_id: session.clientReferenceId,
    customer_email: session.customerEmail,
    metadata: session.metadata,
    payment_intent:
      paymentIntentId && expandPaymentIntent
        ? { id: paymentIntentId, object: "payment_intent" }
        : paymentIntentId,
  };
}

async function sendWebhook(session) {
  const payload = JSON.stringify({
    id: `evt_local_${randomBytes(8).toString("hex")}`,
    object: "event",
    type: "checkout.session.completed",
    data: { object: toStripeSession(session, false) },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  const response = await fetch(`${APP_URL}/api/payments/stripe-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": `t=${timestamp},v1=${signature}`,
    },
    body: payload,
  });

  return `${response.status} ${await response.text()}`;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", STUB_URL);
  const path = url.pathname;

  try {
    // --- メール ---
    if (request.method === "POST" && path === "/mail/send") {
      const mail = JSON.parse((await readBody(request)) || "{}");
      mails.unshift({ ...mail, receivedAt: new Date() });
      console.log(`[mail] ${mail.to} / ${mail.subject}`);
      return send(response, 200, { success: true, id: `local-mail-${mails.length}` });
    }

    if (request.method === "GET" && path === "/mail.json") {
      return send(response, 200, mails);
    }

    // --- Stripe API ---
    if (request.method === "POST" && path === "/v1/checkout/sessions") {
      const form = parseStripeForm(await readBody(request));
      const lineItem = form.line_items?.["0"] ?? {};
      const id = `cs_test_local_${randomBytes(12).toString("hex")}`;
      const session = {
        id,
        amount: Number(lineItem.price_data?.unit_amount ?? 0),
        currency: lineItem.price_data?.currency ?? "jpy",
        itemName: lineItem.price_data?.product_data?.name ?? "",
        metadata: form.metadata ?? {},
        clientReferenceId: form.client_reference_id ?? null,
        customerEmail: form.customer_email ?? null,
        successUrl: form.success_url ?? `${APP_URL}/payment/success`,
        cancelUrl: form.cancel_url ?? `${APP_URL}/payment/cancel`,
        paid: false,
        webhookResult: "",
      };
      sessions.set(id, session);
      console.log(
        `[stripe] session created ${id} / ${session.amount} ${session.currency}`,
      );
      return send(response, 200, toStripeSession(session, false));
    }

    const apiMatch = /^\/v1\/checkout\/sessions\/([^/]+)$/.exec(path);
    if (request.method === "GET" && apiMatch) {
      const session = sessions.get(apiMatch[1]);
      if (!session) {
        return send(response, 404, {
          error: { type: "invalid_request_error", message: "No such checkout.session" },
        });
      }
      return send(response, 200, toStripeSession(session, true));
    }

    // --- テスト用の決済ページ ---
    const checkoutMatch = /^\/checkout\/([^/]+)(\/pay)?$/.exec(path);
    if (checkoutMatch) {
      const session = sessions.get(checkoutMatch[1]);
      if (!session) {
        return send(
          response,
          404,
          page("決済ページ", "<h1>決済が見つかりません</h1>"),
          "text/html",
        );
      }

      if (request.method === "POST" && checkoutMatch[2]) {
        session.paid = true;
        session.webhookResult = await sendWebhook(session).catch(
          (error) => `送信失敗: ${error.message}`,
        );
        console.log(`[stripe] paid ${session.id} / webhook: ${session.webhookResult}`);
        response.writeHead(303, {
          Location: session.successUrl.replace("{CHECKOUT_SESSION_ID}", session.id),
        });
        return response.end();
      }

      return send(
        response,
        200,
        page(
          "テスト決済ページ",
          `<h1>テスト決済ページ（ローカル検証用）</h1>
<p class="muted">Stripe の代わりに表示しているページです。実際の決済は行われません。</p>
<div class="card"><p>${escapeHtml(session.itemName)}</p>
<p style="font-size:28px;font-weight:700">${session.amount.toLocaleString("ja-JP")} 円</p>
<p class="muted">${escapeHtml(session.customerEmail)} / ${escapeHtml(session.id)}</p></div>
<form method="post" action="/checkout/${session.id}/pay" style="display:inline"><button type="submit">テスト決済を完了する</button></form>
<a href="${escapeHtml(session.cancelUrl)}"><button class="secondary" type="button">キャンセルして戻る</button></a>`,
        ),
        "text/html",
      );
    }

    // --- 一覧 ---
    if (request.method === "GET" && path === "/") {
      const mailHtml = mails
        .map(
          (
            mail,
          ) => `<div class="card"><p><strong>${escapeHtml(mail.subject)}</strong></p>
<p class="muted">宛先: ${escapeHtml(mail.to)} / ${mail.receivedAt.toLocaleString("ja-JP")}</p>
<pre>${escapeHtml(mail.text)}</pre></div>`,
        )
        .join("");
      const sessionHtml = [...sessions.values()]
        .reverse()
        .map(
          (
            session,
          ) => `<div class="card"><p>${escapeHtml(session.id)} / ${session.amount.toLocaleString("ja-JP")} 円 /
${session.paid ? "支払い済み" : "未払い"}</p><p class="muted">Webhook: ${escapeHtml(session.webhookResult || "-")}</p></div>`,
        )
        .join("");

      return send(
        response,
        200,
        page(
          "ローカル検証: メール・決済",
          `<h1>ローカル検証: 送信されたメールとテスト決済</h1>
<p class="muted">アプリが送信しようとしたメールをここで受け取っています。実際には送信されていません。</p>
<h2>メール（${mails.length} 通・新しい順）</h2>${mailHtml || "<p>まだありません。</p>"}
<h2>テスト決済（${sessions.size} 件）</h2>${sessionHtml || "<p>まだありません。</p>"}`,
        ),
        "text/html",
      );
    }

    return send(response, 404, {
      error: { message: `Not handled: ${request.method} ${path}` },
    });
  } catch (error) {
    console.error(error);
    return send(response, 500, { error: { message: String(error) } });
  }
});

server.listen(STUB_PORT, "127.0.0.1", () => {
  console.log(`ローカル検証用の代替サーバー: ${STUB_URL}/ （メール一覧・テスト決済）`);
});

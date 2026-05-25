<?php

declare(strict_types=1);

function h(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

function request_origin(): string
{
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return $scheme . '://' . $host;
}

function api_url(): string
{
    $directory = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
    return request_origin() . $directory . '/send-entry-mail.php?debug=1';
}

function post_json(string $url, array $payload): array
{
    $body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($body === false) {
        return [
            'ok' => false,
            'error' => 'Failed to encode JSON payload.',
        ];
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\n",
            'content' => $body,
            'ignore_errors' => true,
            'timeout' => 20,
        ],
    ]);

    $responseBody = file_get_contents($url, false, $context);
    $headers = $http_response_header ?? [];
    $statusLine = $headers[0] ?? '';

    return [
        'ok' => $responseBody !== false,
        'url' => $url,
        'statusLine' => $statusLine,
        'headers' => $headers,
        'body' => $responseBody === false ? null : $responseBody,
        'json' => $responseBody === false ? null : json_decode($responseBody, true),
    ];
}

$defaultTo = '';
$result = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $to = trim((string) ($_POST['to'] ?? ''));
    $payload = [
        'to' => $to,
        'subject' => 'COPA ALMA PHP Mail API Test',
        'html' => '<p>COPA ALMA PHP Mail API test message.</p>',
        'text' => 'COPA ALMA PHP Mail API test message.',
    ];
    $defaultTo = $to;
    $result = post_json(api_url(), $payload);
}
?>
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>COPA ALMA PHP Mail API Test</title>
    <style>
      body { margin: 0; background: #111; color: #f5f5f5; font-family: Arial, sans-serif; }
      main { width: min(720px, calc(100% - 32px)); margin: 48px auto; }
      input, button, pre { box-sizing: border-box; width: 100%; margin-top: 8px; padding: 12px; }
      input, pre { border: 1px solid #444; background: #1c1c1c; color: #fff; }
      button { border: 0; background: #d6ad45; color: #111; font-weight: 700; cursor: pointer; }
      pre { min-height: 180px; overflow: auto; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <main>
      <h1>COPA ALMA PHP Mail API Test</h1>
      <p>API URL: <?= h(api_url()) ?></p>
      <form method="post">
        <label>
          To
          <input name="to" type="email" required value="<?= h($defaultTo) ?>" placeholder="your-address@example.com">
        </label>
        <button type="submit">Send Test Email</button>
      </form>

      <h2>Response</h2>
      <pre><?= h($result === null ? 'Not sent yet.' : json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT)) ?></pre>
    </main>
  </body>
</html>

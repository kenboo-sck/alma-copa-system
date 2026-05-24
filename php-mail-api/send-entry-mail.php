<?php

declare(strict_types=1);

use PHPMailer\PHPMailer\Exception as MailerException;
use PHPMailer\PHPMailer\PHPMailer;

require __DIR__ . '/vendor/autoload.php';

$config = [];
$configPath = __DIR__ . '/config.php';
if (is_file($configPath)) {
    $loadedConfig = require $configPath;
    if (is_array($loadedConfig)) {
        $config = $loadedConfig;
    }
}

function config_value(array $config, string $key, ?string $default = null): ?string
{
    if (array_key_exists($key, $config) && $config[$key] !== '') {
        return is_array($config[$key]) ? null : (string) $config[$key];
    }

    $value = getenv($key);
    return $value === false || $value === '' ? $default : $value;
}

function json_response(int $statusCode, array $payload): never
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function debug_enabled(array $config): bool
{
    $value = config_value($config, 'MAIL_API_DEBUG', 'false');
    return $value === '1' || strtolower((string) $value) === 'true' || ($_GET['debug'] ?? '') === '1';
}

function mask_value(?string $value): ?string
{
    if ($value === null || $value === '') {
        return $value;
    }

    if (strlen($value) <= 6) {
        return '***';
    }

    return substr($value, 0, 3) . '***' . substr($value, -3);
}

function debug_context(array $config, array $extra = []): array
{
    return array_merge([
        'method' => $_SERVER['REQUEST_METHOD'] ?? null,
        'contentType' => $_SERVER['CONTENT_TYPE'] ?? null,
        'smtpHost' => config_value($config, 'SMTP_HOST'),
        'smtpPort' => config_value($config, 'SMTP_PORT', '587'),
        'smtpUser' => mask_value(config_value($config, 'SMTP_USER')),
        'fromAddress' => config_value($config, 'MAIL_FROM_ADDRESS'),
        'hasSmtpPassword' => config_value($config, 'SMTP_PASSWORD') !== null,
        'phpVersion' => PHP_VERSION,
    ], $extra);
}

function debug_response(int $statusCode, array $payload, array $config, array $extra = []): never
{
    if (debug_enabled($config)) {
        $payload['debug'] = debug_context($config, $extra);
    }

    json_response($statusCode, $payload);
}

function allowed_origins(array $config): array
{
    if (isset($config['CORS_ALLOWED_ORIGINS']) && is_array($config['CORS_ALLOWED_ORIGINS'])) {
        return array_values(array_filter($config['CORS_ALLOWED_ORIGINS'], 'is_string'));
    }

    $origins = config_value($config, 'CORS_ALLOWED_ORIGINS', 'https://copa-alma.com');
    return array_map('trim', explode(',', $origins ?? ''));
}

function is_origin_allowed(string $origin, array $allowedOrigins): bool
{
    foreach ($allowedOrigins as $allowedOrigin) {
        if ($origin === $allowedOrigin) {
            return true;
        }

        if (str_starts_with($allowedOrigin, 'https://*.')) {
            $suffix = substr($allowedOrigin, strlen('https://*'));
            if (str_starts_with($origin, 'https://') && str_ends_with($origin, $suffix)) {
                return true;
            }
        }
    }

    return false;
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = allowed_origins($config);
if ($origin !== '' && is_origin_allowed($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Max-Age: 86400');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    json_response(200, ['success' => true]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    debug_response(405, [
        'success' => false,
        'error' => 'Method not allowed.',
    ], $config);
}

$rawBody = file_get_contents('php://input');
$payload = json_decode($rawBody === false ? '' : $rawBody, true);

if (!is_array($payload)) {
    debug_response(400, [
        'success' => false,
        'error' => 'Invalid JSON body.',
    ], $config, [
        'rawBodyLength' => $rawBody === false ? null : strlen($rawBody),
        'jsonError' => json_last_error_msg(),
    ]);
}

$to = trim((string) ($payload['to'] ?? ''));
$subject = trim((string) ($payload['subject'] ?? ''));
$html = (string) ($payload['html'] ?? '');
$text = (string) ($payload['text'] ?? '');

if ($to === '' || $subject === '' || $html === '' || $text === '') {
    debug_response(400, [
        'success' => false,
        'error' => 'Required fields: to, subject, html, text.',
    ], $config, [
        'receivedKeys' => array_keys($payload),
    ]);
}

if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
    debug_response(400, [
        'success' => false,
        'error' => 'Invalid recipient email address.',
    ], $config, [
        'recipient' => $to,
    ]);
}

$requiredKeys = [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'MAIL_FROM_ADDRESS',
];

$missingKeys = [];
foreach ($requiredKeys as $key) {
    if (!config_value($config, $key)) {
        $missingKeys[] = $key;
    }
}

if ($missingKeys !== []) {
    debug_response(500, [
        'success' => false,
        'error' => 'SMTP configuration is incomplete: ' . implode(', ', $missingKeys),
    ], $config, [
        'missingKeys' => $missingKeys,
    ]);
}

$fromAddress = (string) config_value($config, 'MAIL_FROM_ADDRESS');
if (!filter_var($fromAddress, FILTER_VALIDATE_EMAIL)) {
    debug_response(500, [
        'success' => false,
        'error' => 'MAIL_FROM_ADDRESS is invalid.',
    ], $config);
}

$mail = new PHPMailer(true);

try {
    $mail->isSMTP();
    $mail->Host = (string) config_value($config, 'SMTP_HOST');
    $mail->Port = (int) config_value($config, 'SMTP_PORT', '587');
    $mail->SMTPAuth = true;
    $mail->Username = (string) config_value($config, 'SMTP_USER');
    $mail->Password = (string) config_value($config, 'SMTP_PASSWORD');
    $mail->SMTPSecure = $mail->Port === 465
        ? PHPMailer::ENCRYPTION_SMTPS
        : PHPMailer::ENCRYPTION_STARTTLS;

    $mail->CharSet = 'UTF-8';
    $mail->Encoding = 'base64';
    $mail->setFrom($fromAddress, config_value($config, 'MAIL_FROM_NAME', 'ALMA COPA') ?? 'ALMA COPA');
    $mail->addAddress($to);
    $mail->Subject = $subject;
    $mail->isHTML(true);
    $mail->Body = $html;
    $mail->AltBody = $text;

    $mail->send();

    json_response(200, ['success' => true]);
} catch (MailerException $error) {
    error_log('ALMA COPA mail send failed: ' . $error->getMessage());

    debug_response(500, [
        'success' => false,
        'error' => $error->getMessage(),
    ], $config, [
        'recipient' => $to,
        'mailerError' => $error->getMessage(),
    ]);
}

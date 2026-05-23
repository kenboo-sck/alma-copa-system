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
    json_response(405, [
        'success' => false,
        'error' => 'Method not allowed.',
    ]);
}

$rawBody = file_get_contents('php://input');
$payload = json_decode($rawBody === false ? '' : $rawBody, true);

if (!is_array($payload)) {
    json_response(400, [
        'success' => false,
        'error' => 'Invalid JSON body.',
    ]);
}

$to = trim((string) ($payload['to'] ?? ''));
$subject = trim((string) ($payload['subject'] ?? ''));
$html = (string) ($payload['html'] ?? '');
$text = (string) ($payload['text'] ?? '');

if ($to === '' || $subject === '' || $html === '' || $text === '') {
    json_response(400, [
        'success' => false,
        'error' => 'Required fields: to, subject, html, text.',
    ]);
}

if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
    json_response(400, [
        'success' => false,
        'error' => 'Invalid recipient email address.',
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
    json_response(500, [
        'success' => false,
        'error' => 'SMTP configuration is incomplete: ' . implode(', ', $missingKeys),
    ]);
}

$fromAddress = (string) config_value($config, 'MAIL_FROM_ADDRESS');
if (!filter_var($fromAddress, FILTER_VALIDATE_EMAIL)) {
    json_response(500, [
        'success' => false,
        'error' => 'MAIL_FROM_ADDRESS is invalid.',
    ]);
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
    json_response(500, [
        'success' => false,
        'error' => $error->getMessage(),
    ]);
}

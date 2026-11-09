<?php
declare(strict_types=1);
ini_set('display_errors', '0');
ini_set('log_errors', '1');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function respond(int $status, array $body): never { http_response_code($status); echo json_encode($body, JSON_UNESCAPED_UNICODE); exit; }
function fail(int $status, string $error): never { respond($status, ['ok'=>false, 'error'=>$error]); }
set_error_handler(static function(int $severity): never { throw new ErrorException('internal_error', 0, $severity); });
function units(string $value): int { return preg_match_all('/./us', $value) + preg_match_all('/[\x{10000}-\x{10FFFF}]/u', $value); }
function oneLine(string $value): bool { return (bool)preg_match('//u', $value) && !preg_match('/[\x00-\x1F\x7F\x{0085}\x{2028}\x{2029}\x{202A}-\x{202E}\x{2066}-\x{2069}]/u', $value); }
function line(mixed $value, int $min, int $max, bool $trim = true): bool {
 if (!is_string($value) || !oneLine($value)) return false;
 $size = units($trim ? trim($value, ' ') : $value); return $size >= $min && $size <= $max;
}
function privateFile(string $path) {
 if (is_link($path)) throw new RuntimeException('state_unavailable');
 $file = fopen($path, 'c+');
 if ($file === false || !chmod($path, 0600)) throw new RuntimeException('state_unavailable');
 return $file;
}
function rateLimit(): void {
 umask(0077);
 $dir = sys_get_temp_dir() . '/chalet40-consult';
 if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) throw new RuntimeException('state_unavailable');
 $stat = lstat($dir);
 if (is_link($dir) || ($stat['mode'] & 0777) !== 0700 || (function_exists('posix_geteuid') && $stat['uid'] !== posix_geteuid())) throw new RuntimeException('state_unavailable');
 // Every request and cleanup use the same global lock; no state inode can be replaced during a request.
 $guard = privateFile($dir . '/.gc.lock');
 if (!flock($guard, LOCK_EX)) throw new RuntimeException('state_unavailable');
 try {
  $now = time();
  $last = stream_get_contents($guard);
  if ($last === false || ($last !== '' && !ctype_digit($last))) throw new RuntimeException('state_unavailable');
  if ($last === '' || $now - (int)$last >= 60) {
   foreach (new DirectoryIterator($dir) as $entry) {
    if (preg_match('/^[a-f0-9]{64}\.json$/D', $entry->getFilename()) && !$entry->isLink() && $entry->isFile() && $entry->getMTime() < $now - 86400 && !unlink($entry->getPathname())) throw new RuntimeException('state_unavailable');
   }
   $stamp = (string)$now;
   if (!rewind($guard) || !ftruncate($guard, 0) || fwrite($guard, $stamp) !== strlen($stamp) || !fflush($guard)) throw new RuntimeException('state_unavailable');
  }
  $path = $dir . '/' . hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown') . '.json';
  $file = privateFile($path);
  try {
   if (!flock($file, LOCK_EX)) throw new RuntimeException('state_unavailable');
   $stored = stream_get_contents($file);
   if ($stored === false) throw new RuntimeException('state_unavailable');
   $times = $stored === '' ? [] : json_decode($stored, true, 16, JSON_THROW_ON_ERROR);
   if (!is_array($times) || !array_is_list($times)) throw new RuntimeException('state_unavailable');
   foreach ($times as $time) if (!is_int($time) || $time < 0 || $time > $now) throw new RuntimeException('state_unavailable');
   $recent = array_values(array_filter($times, static fn($time) => $time > $now - 60));
   if (count($recent) >= 5) { header('Retry-After: ' . max(1, 60 - ($now - min($recent)))); fail(429, 'rate_limited'); }
   $recent[] = $now; $encoded = json_encode($recent, JSON_THROW_ON_ERROR);
   if (!rewind($file) || !ftruncate($file, 0) || fwrite($file, $encoded) !== strlen($encoded) || !fflush($file)) throw new RuntimeException('state_unavailable');
  } finally { flock($file, LOCK_UN); fclose($file); }
 } finally { flock($guard, LOCK_UN); fclose($guard); }
}
try {
 if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { header('Allow: POST'); fail(405, 'method_not_allowed'); }
 if (($_SERVER['HTTP_ORIGIN'] ?? '') !== 'https://chalet40.moscow' || ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') fail(403, 'origin_not_allowed');
 if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '', 2)[0])) !== 'application/json') fail(415, 'invalid_content_type');
 $raw = file_get_contents('php://input', false, null, 0, 8193);
 if ($raw === false || strlen($raw) > 8192) fail(413, 'payload_too_large');
 try { $object = json_decode($raw, false, 32, JSON_THROW_ON_ERROR); } catch (JsonException $e) { fail(400, 'invalid_json'); }
 if (!$object instanceof stdClass) fail(422, 'validation_failed');
 $data = (array)$object;
 if (!line($data['name'] ?? null, 2, 100) || !line($data['contact'] ?? null, 3, 100) || !line($data['page'] ?? null, 1, 500, false) || !str_starts_with($data['page'], '/') || ($data['consent'] ?? null) !== true || !in_array($data['method'] ?? '', ['whatsapp','phone','telegram','max'], true) || !in_array($data['lang'] ?? '', ['ru','en'], true)) fail(422, 'validation_failed');
 $data['name'] = trim($data['name'], ' '); $data['contact'] = trim($data['contact'], ' ');
 if (array_key_exists('lot', $data) && (!line($data['lot'], 1, 64, false) || !preg_match('/^(?:[a-z]+|[PK][1-9]\d*)$/D', $data['lot']))) fail(422, 'validation_failed');
 if (array_key_exists('company', $data) && !line($data['company'], 0, 200, false)) fail(422, 'validation_failed');
 if (array_key_exists('lotTitle', $data)) { if (!line($data['lotTitle'], 0, 80)) fail(422, 'validation_failed'); $data['lotTitle'] = trim($data['lotTitle'], ' '); }
 $contact = $data['contact'];
 $validContact = $data['method'] === 'telegram' ? preg_match('/^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/D', $contact) : (preg_match('/^\+?[\d ().-]{7,30}$/D', $contact) && strlen(preg_replace('/\D/', '', $contact)) >= 7);
 if (!$validContact) fail(422, 'validation_failed');
 $allowedUtm = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content']; $utm = [];
 if (array_key_exists('utm', $data)) {
  if (!$data['utm'] instanceof stdClass || count((array)$data['utm']) > 5) fail(422, 'validation_failed');
  foreach ((array)$data['utm'] as $key => $value) if (!in_array($key, $allowedUtm, true) || !line($value, 0, 200, false)) fail(422, 'validation_failed');
  foreach ($allowedUtm as $key) if (property_exists($data['utm'], $key)) $utm[$key] = $data['utm']->$key;
 }
 if (($data['company'] ?? '') !== '') respond(200, ['ok'=>true]);
 require_once __DIR__ . '/telegram-message.php';
 $data['utm'] = $utm;
 $text = telegramMessage($data);
 if (units($text) > 4096) fail(422, 'validation_failed');
 rateLimit();
 $configFile = __DIR__ . '/config.php';
 if (!is_file($configFile) || !function_exists('curl_init')) fail(503, 'service_unavailable');
 ob_start(); try { $config = require $configFile; } finally { ob_end_clean(); }
 if (!is_array($config) || !is_string($config['token'] ?? null) || !preg_match('/^\d+:[A-Za-z0-9_-]+$/D', $config['token']) || !is_string($config['chat_id'] ?? null) || !preg_match('/^(?:-?\d+|@[A-Za-z][A-Za-z0-9_]{4,31})$/D', $config['chat_id'])) fail(503, 'service_unavailable');
 $curl = curl_init('https://api.telegram.org/bot' . $config['token'] . '/sendMessage');
 if ($curl === false) throw new RuntimeException('delivery_failed');
 $result = '';
 curl_setopt_array($curl, [CURLOPT_POST=>true, CURLOPT_POSTFIELDS=>http_build_query(['chat_id'=>$config['chat_id'], 'text'=>$text, 'parse_mode'=>'HTML', 'link_preview_options'=>'{"is_disabled":true}']), CURLOPT_CONNECTTIMEOUT=>5, CURLOPT_TIMEOUT=>12, (defined('CURLOPT_PROTOCOLS_STR') ? constant('CURLOPT_PROTOCOLS_STR') : CURLOPT_PROTOCOLS)=>(defined('CURLOPT_PROTOCOLS_STR') ? 'HTTPS' : CURLPROTO_HTTPS), CURLOPT_SSL_VERIFYPEER=>true, CURLOPT_SSL_VERIFYHOST=>2, CURLOPT_WRITEFUNCTION=>static function($handle, string $chunk) use (&$result): int { if (strlen($result) + strlen($chunk) > 16384) return 0; $result .= $chunk; return strlen($chunk); }]);
 $success = curl_exec($curl); $status = curl_getinfo($curl, CURLINFO_HTTP_CODE); curl_close($curl);
 $telegram = json_decode($result, true);
 if ($success === false || $status !== 200 || !is_array($telegram) || ($telegram['ok'] ?? false) !== true) fail(502, 'delivery_failed');
 respond(200, ['ok'=>true]);
} catch (Throwable $e) { error_log('chalet40_consult: internal_error'); fail(503, 'service_unavailable'); }

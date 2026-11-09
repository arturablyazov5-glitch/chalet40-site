<?php
declare(strict_types=1);
function telegramEscape(string $value): string { return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function telegramClean(string $value): string { return trim(preg_replace('/[\x00-\x1F\x7F\x{0085}\x{2028}\x{2029}\x{202A}-\x{202E}\x{2066}-\x{2069}]/u', ' ', $value) ?? '', ' '); }
function telegramUnits(string $value): int { return preg_match_all('/./us', $value) + preg_match_all('/[\x{10000}-\x{10FFFF}]/u', $value); }
function telegramField(string $value, int $budget): string {
 $text = telegramClean($value); $full = telegramEscape($text);
 if (telegramUnits($full) <= $budget) return $full;
 $result = '';
 foreach (preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY) as $char) {
  $escaped = telegramEscape($char); if (telegramUnits($result . $escaped) > $budget - 1) break; $result .= $escaped;
 }
 return $result . '…';
}
function telegramLink(string $href, string $label): string {
 if (!preg_match('/^(?:https:\/\/|tel:|mailto:)/', $href)) throw new RuntimeException('unsafe_message_link');
 return '<a href="' . telegramEscape($href) . '">' . $label . '</a>';
}
function telegramMessage(array $data, ?DateTimeImmutable $now = null): string {
 $spec = json_decode(file_get_contents(__DIR__ . '/message-format.json'), true, 32, JSON_THROW_ON_ERROR);
 $stamp = ($now ?? new DateTimeImmutable('now'))->setTimezone(new DateTimeZone($spec['timezone']))->format('d.m.Y, H:i');
 $rawPage = preg_split('/[?#]/', telegramClean($data['page']), 2)[0];
 $path = '/' . ltrim($rawPage, '/');
 $url = $spec['origin'] . preg_replace('/%25([a-f\d]{2})/i', '%$1', implode('/', array_map('rawurlencode', explode('/', $path))));
 $segments = array_values(array_filter(explode('/', preg_replace('/^\/en(?=\/|$)/', '', $rawPage)), static fn($part) => $part !== ''));
 $contexts = $spec['contexts'][$data['lang'] === 'en' ? 'en' : 'ru'];
 $contextKey = in_array($segments[0] ?? '', ['office', 'parking'], true) ? ($segments[1] ?? '') : (($segments[0] ?? '') === 'retail' ? 'retail' : '');
 $context = $contexts[$contextKey] ?? '';
 $displayPath = substr($url, strlen($spec['origin']));
 $contact = telegramClean($data['contact']);
 foreach ([1, .5, .25, .1] as $scale) {
  $field = static fn(string $value, string $key): string => telegramField($value, max(12, (int)floor($spec['limits'][$key] * $scale)));
  $method = $data['method'] === 'telegram' ? 'telegram' : ($data['method'] === 'max' ? 'max' : ($data['method'] === 'whatsapp' ? 'whatsapp' : 'phone'));
  if ($method === 'telegram') {
   $username = substr(preg_replace('/[^a-zA-Z\d_]/', '', preg_replace('/^@/', '', $contact)), 0, 32);
   $channel = telegramLink('https://t.me/' . $username, $field('@' . $username, 'contact'));
  } elseif ($method === 'max') {
   $channel = '<code>' . $field($contact, 'contact') . '</code>';
  } else {
   $digits = substr(preg_replace('/\D/', '', $contact), 0, 30);
   $href = $method === 'whatsapp' ? 'https://wa.me/' . $digits : 'tel:' . (str_starts_with($contact, '+') ? '+' : '') . $digits;
   $channel = '<code>' . $field($contact, 'contact') . '</code> · ' . telegramLink($href, $method === 'whatsapp' ? $spec['write'] : $spec['call']);
  }
  $page = telegramUnits($url) <= $spec['maxHrefUnits'] ? telegramLink($url, $field($displayPath, 'page')) : '<code>' . $field($displayPath, 'page') . '</code> · ' . telegramLink($spec['origin'] . '/', $spec['siteLink']);
  $rows = [$spec['heading'], '', $spec['nameLabel'] . ' ' . $field($data['name'], 'name'), $spec['contactLabel'] . ' ' . $spec['methods'][$method] . ' — ' . $channel, $spec['lotLabel'] . ' ' . $field(($data['lotTitle'] ?? '') !== '' ? $data['lotTitle'] : ($data['lot'] ?? $spec['missingLot']), 'lot') . ($context !== '' ? ', ' . $field($context, 'context') : ''), $spec['pageLabel'] . ' ' . $page, $spec['languageLabel'] . ' ' . telegramField(strtoupper($data['lang']), 8), $spec['timeLabel'] . ' ' . $stamp . ' (МСК)'];
  $utm = [];
  foreach ($spec['utmKeys'] as $key) if (isset($data['utm'][$key]) && $data['utm'][$key] !== '') $utm[] = substr($key, 4) . '=<code>' . $field($data['utm'][$key], 'utm') . '</code>';
  if ($utm !== []) $rows[] = $spec['utmLabel'] . ' ' . implode(' · ', $utm);
  $html = implode("\n", $rows); if (telegramUnits($html) <= $spec['maxUnits']) return $html;
 }
 throw new RuntimeException('message_too_long');
}

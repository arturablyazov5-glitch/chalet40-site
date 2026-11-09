import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { consultMessage } from "../src/lib/telegram-message";
import { consultSchema } from "../src/lib/consult";
import { phpMessageEquivalent } from "./helpers/php-message-equivalent";
import golden from "./fixtures/consult-messages.json";
for (const fixture of golden.fixtures)
  test(`Telegram HTML golden: ${fixture.name}`, () => {
    const actual = consultMessage(fixture.input, {
      now: new Date(fixture.now),
    });
    assert.equal(actual, fixture.expected);
    assert.equal(
      phpMessageEquivalent(fixture.input, fixture.now),
      fixture.expected,
    );
    assert.ok(actual.length <= 4096);
    assert.doesNotMatch(actual, /\p{Extended_Pictographic}|\uFE0F/gu);
    assert.match(actual, /^<b>Новая заявка с сайта Chalet 40<\/b>\n\n<b>Имя:<\/b>/);
    assert.match(actual, /\n<b>Язык:<\/b> (RU|EN)\n<b>Время:<\/b> \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2} \(МСК\)/);
    const lotLine = actual.split("\n").find((line) => line.startsWith("<b>Помещение:"))!;
    assert.doesNotMatch(lotLine, /office\/|parking\/|retail\//);
    if (fixture.name === "ordinary") assert.equal(lotLine, '<b>Помещение:</b> Вэлью, корпус «Пятницкая»');
    if (fixture.name === "english-value") assert.equal(lotLine, '<b>Помещение:</b> Value, Pyatnitskaya building');
    if (fixture.name === "unknown-building") assert.equal(lotLine, '<b>Помещение:</b> Вэлью');
    if (fixture.name === "parking-floor-2") assert.equal(lotLine, '<b>Помещение:</b> Машиноместо P13, паркинг, этаж −2');
    assert.doesNotMatch(actual, />https:\/\/chalet40\.moscow/);
    // Validate the literal HTML grammar, matching entities, nesting and link schemes.
    const stack: string[] = [];
    let previous = 0;
    for (const match of actual.matchAll(/<([^>]+)>/g)) {
      const plain = actual.slice(previous, match.index);
      assert.ok(!plain.includes("<"));
      assert.ok(!/&(?!(?:amp|lt|gt|quot|#039);)/.test(plain));
      previous = match.index + match[0].length;
      const tag = match[1]!;
      if (tag.startsWith("/")) assert.equal(stack.pop(), tag.slice(1));
      else if (tag === "b" || tag === "code") {
        assert.notEqual(stack.at(-1), "a");
        stack.push(tag);
      } else {
        assert.match(tag, /^a href="(?:https:\/\/|tel:|mailto:)[^"<>\n]+"$/);
        assert.equal(stack.length, 0);
        stack.push("a");
      }
    }
    assert.deepEqual(stack, []);
    if (fixture.name === "long-name" || fixture.name === "escaped-budget")
      assert.ok(actual.includes("…"));
  });
test("PHP formatter source changes require golden-equivalent review (PHP is not executed)", () => {
  const php = readFileSync(
    new URL("../public/api/telegram-message.php", import.meta.url),
    "utf8",
  );
  assert.equal(
    createHash("sha256").update(php).digest("hex"),
    golden.phpSourceSha256,
  );
  assert.match(
    php,
    /htmlspecialchars\(\$value, ENT_QUOTES \| ENT_SUBSTITUTE, 'UTF-8'\)/,
  );
  const endpoint = readFileSync(
    new URL("../public/api/consult.php", import.meta.url),
    "utf8",
  );
  assert.match(endpoint, /'parse_mode'\s*=>\s*'HTML'/);
  assert.match(endpoint, /telegramMessage\(\$data\)/);
  assert.match(endpoint, /line\(\$data\['lotTitle'\], 0, 80\)/);
});
test("lotTitle is optional, localized, bounded, and one-line; legacy clients remain valid", () => {
  const old = {
    name: "Test User",
    method: "phone",
    contact: "+79991234567",
    consent: true,
    lot: "value",
    page: "/office/pyatnitskaya/value",
    lang: "ru",
  };
  assert.ok(consultSchema.safeParse(old).success);
  assert.equal(
    consultSchema.parse({ ...old, lotTitle: "  Вэлью  " }).lotTitle,
    "Вэлью",
  );
  assert.ok(
    consultSchema.safeParse({ ...old, lotTitle: "я".repeat(80) }).success,
  );
  for (const lotTitle of ["я".repeat(81), "a\nB", "a\u2028B", "a\u202eB"])
    assert.equal(consultSchema.safeParse({ ...old, lotTitle }).success, false);
  assert.equal(
    consultSchema.safeParse({ ...old, name: "И".repeat(1000) }).success,
    false,
  );
  const now = new Date("2026-10-26T08:52:00Z");
  const message = consultMessage(
    { ...old, name: "Иван\nПоддельная строка", lotTitle: "Офис\u2028<admin>" },
    { now },
  );
  assert.ok(!message.includes("\nПоддельная"));
  assert.ok(message.includes("Офис &lt;admin&gt;"));
});

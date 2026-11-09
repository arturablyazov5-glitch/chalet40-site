import spec from "../data/consult-message.json";
export interface MessageInput {
  name: string;
  method: string;
  contact: string;
  lot?: string;
  lotTitle?: string;
  page: string;
  lang: string;
  utm?: Record<string, string | undefined>;
}
export const cleanMessageField = (value: string) =>
  value
    .replace(
      /[\u0000-\u001F\u007F\u0085\u2028\u2029\u202A-\u202E\u2066-\u2069]/gu,
      " ",
    )
    .replace(/[\uD800-\uDFFF]/gu, "�")
    .replace(/^ +| +$/g, "");
/** Equivalent to htmlspecialchars(ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'). */
export const escapeTelegramHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
export function messageField(value: string, budget: number): string {
  const text = cleanMessageField(value);
  const full = escapeTelegramHtml(text);
  if (full.length <= budget) return full;
  let result = "";
  for (const char of text) {
    const escaped = escapeTelegramHtml(char);
    if (result.length + escaped.length > budget - 1) break;
    result += escaped;
  }
  return result + "…";
}
function pageAddress(page: string): string {
  const path =
    "/" + cleanMessageField(page).split(/[?#]/, 1)[0]!.replace(/^\/+/, "");
  return (
    spec.origin +
    path
      .split("/")
      .map((part) =>
        encodeURIComponent(part).replace(
          /[!'()*]/g,
          (char) => "%" + char.charCodeAt(0).toString(16).toUpperCase(),
        ),
      )
      .join("/")
      .replace(/%25([a-f\d]{2})/gi, "%$1")
  );
}
export function consultMessage(
  data: MessageInput,
  options: { now?: Date } = {},
): string {
  const now = options.now ?? new Date();
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: spec.timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const datePart = (type: string) =>
    parts.find((part) => part.type === type)!.value;
  const stamp = `${datePart("day")}.${datePart("month")}.${datePart("year")}, ${datePart("hour")}:${datePart("minute")}`;
  const url = pageAddress(data.page);
  const segments = cleanMessageField(data.page)
    .split(/[?#]/, 1)[0]!
    .replace(/^\/en(?=\/|$)/, "")
    .split("/")
    .filter(Boolean);
  const contexts = spec.contexts[data.lang === "en" ? "en" : "ru"];
  const contextKey = segments[0] === "office" || segments[0] === "parking"
    ? segments[1] : segments[0] === "retail" ? "retail" : undefined;
  const context = contextKey && Object.hasOwn(contexts, contextKey)
    ? contexts[contextKey as keyof typeof contexts] : "";
  const displayPath = url.slice(spec.origin.length);
  const contact = cleanMessageField(data.contact);
  const link = (href: string, label: string) => {
    if (!/^(https:\/\/|tel:|mailto:)/.test(href))
      throw new Error("Unsafe message link");
    return `<a href="${escapeTelegramHtml(href)}">${label}</a>`;
  };
  for (const scale of [1, 0.5, 0.25, 0.1]) {
    const field = (value: string, key: keyof typeof spec.limits) =>
      messageField(value, Math.max(12, Math.floor(spec.limits[key] * scale)));
    const method =
      data.method === "telegram"
        ? "telegram"
        : data.method === "max"
          ? "max"
          : data.method === "whatsapp"
            ? "whatsapp"
            : "phone";
    let channel: string;
    if (method === "telegram") {
      const username = contact
        .replace(/^@/, "")
        .replace(/[^a-zA-Z\d_]/g, "")
        .slice(0, 32);
      channel = link(
        "https://t.me/" + username,
        field("@" + username, "contact"),
      );
    } else if (method === "max") {
      channel = `<code>${field(contact, "contact")}</code>`;
    } else {
      const digits = contact.replace(/\D/g, "").slice(0, 30);
      const href =
        method === "whatsapp"
          ? "https://wa.me/" + digits
          : "tel:" + (contact.startsWith("+") ? "+" : "") + digits;
      channel = `<code>${field(contact, "contact")}</code> · ${link(href, method === "whatsapp" ? spec.write : spec.call)}`;
    }
    const page =
      url.length <= spec.maxHrefUnits
        ? link(url, field(displayPath, "page"))
        : `<code>${field(displayPath, "page")}</code> · ${link(spec.origin + "/", spec.siteLink)}`;
    const rows = [
      spec.heading,
      "",
      `${spec.nameLabel} ${field(data.name, "name")}`,
      `${spec.contactLabel} ${spec.methods[method]} — ${channel}`,
      `${spec.lotLabel} ${field(data.lotTitle || data.lot || spec.missingLot, "lot")}${context ? ", " + field(context, "context") : ""}`,
      `${spec.pageLabel} ${page}`,
      `${spec.languageLabel} ${messageField(data.lang.toUpperCase(), 8)}`,
      `${spec.timeLabel} ${stamp} (МСК)`,
    ];
    const utm = spec.utmKeys
      .filter((key) => data.utm?.[key] !== undefined && data.utm[key] !== "")
      .map(
        (key) =>
          `${key.slice(4)}=<code>${field(data.utm![key]!, "utm")}</code>`,
      );
    if (utm.length) rows.push(spec.utmLabel + " " + utm.join(" · "));
    const html = rows.join("\n");
    if (html.length <= spec.maxUnits) return html;
  }
  throw new Error("Message exceeds safe Telegram limit");
}

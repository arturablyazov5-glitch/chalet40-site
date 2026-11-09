/** Independent JS transcription of public/api/telegram-message.php; not a PHP runtime. */
import spec from "../../src/data/consult-message.json";
type Input = {
  name: string;
  method: string;
  contact: string;
  lot?: string;
  lotTitle?: string;
  page: string;
  lang: string;
  utm?: Record<string, string | undefined>;
};
export function phpMessageEquivalent(data: Input, iso: string): string {
  const clean = (s: string) =>
    s
      .replace(
        /[\x00-\x1f\x7f\u0085\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu,
        " ",
      )
      .replace(/^ +| +$/g, "");
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  const htmlspecialchars = (s: string) =>
    s.replace(/[&<>"']/g, (c) => entities[c]!);
  function field(s: string, budget: number) {
    const raw = clean(s);
    if (htmlspecialchars(raw).length <= budget) return htmlspecialchars(raw);
    let buffer = "";
    for (const point of Array.from(raw)) {
      const next = htmlspecialchars(point);
      if (buffer.length + next.length > budget - 1) break;
      buffer += next;
    }
    return buffer + "…";
  }
  const link = (href: string, label: string) => {
    if (!/^(?:https:\/\/|tel:|mailto:)/.test(href))
      throw new Error("unsafe_message_link");
    return '<a href="' + htmlspecialchars(href) + '">' + label + "</a>";
  };
  const zone = new Intl.DateTimeFormat("en-GB", {
    timeZone: spec.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const clock = Object.fromEntries(zone.map((p) => [p.type, p.value]));
  const stamp =
    clock.day +
    "." +
    clock.month +
    "." +
    clock.year +
    ", " +
    clock.hour +
    ":" +
    clock.minute;
  const rawPage = clean(data.page).split(/[?#]/, 2)[0]!;
  const rawPath = "/" + rawPage.replace(/^\/+/, "");
  const encoded = rawPath
    .split("/")
    .map((s) =>
      encodeURIComponent(s).replace(
        /[!'()*]/g,
        (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
      ),
    )
    .join("/")
    .replace(/%25([a-f\d]{2})/gi, "%$1");
  const url = spec.origin + encoded;
  const path = rawPage
    .replace(/^\/en(?=\/|$)/, "")
    .split("/")
    .filter((s) => s !== "");
  const localized = spec.contexts[data.lang === "en" ? "en" : "ru"];
  const key = path[0] === "office" || path[0] === "parking" ? path[1]
    : path[0] === "retail" ? "retail" : undefined;
  const context = key && Object.hasOwn(localized, key)
    ? localized[key as keyof typeof localized] : "";
  const displayPath = url.substring(spec.origin.length);
  for (const factor of [1, 0.5, 0.25, 0.1]) {
    const f = (s: string, key: keyof typeof spec.limits) =>
      field(s, Math.max(12, Math.floor(spec.limits[key] * factor)));
    const method =
      data.method === "telegram"
        ? "telegram"
        : data.method === "max"
          ? "max"
          : data.method === "whatsapp"
            ? "whatsapp"
            : "phone";
    const contact = clean(data.contact);
    let channel = "";
    if (method === "telegram") {
      const id = contact
        .replace(/^@/, "")
        .replace(/[^a-zA-Z\d_]/g, "")
        .substring(0, 32);
      channel = link("https://t.me/" + id, f("@" + id, "contact"));
    } else if (method === "max") {
      channel = "<code>" + f(contact, "contact") + "</code>";
    } else {
      const digits = contact.replace(/\D/g, "").substring(0, 30);
      const href =
        method === "whatsapp"
          ? "https://wa.me/" + digits
          : "tel:" + (contact.startsWith("+") ? "+" : "") + digits;
      channel =
        "<code>" +
        f(contact, "contact") +
        "</code> · " +
        link(href, method === "whatsapp" ? spec.write : spec.call);
    }
    const page =
      url.length <= spec.maxHrefUnits
        ? link(url, f(displayPath, "page"))
        : "<code>" +
          f(displayPath, "page") +
          "</code> · " +
          link(spec.origin + "/", spec.siteLink);
    const rows = [
      spec.heading,
      "",
      spec.nameLabel + " " + f(data.name, "name"),
      spec.contactLabel + " " + spec.methods[method] + " — " + channel,
      spec.lotLabel +
        " " +
        f(data.lotTitle || data.lot || spec.missingLot, "lot") +
        (context ? ", " + f(context, "context") : ""),
      spec.pageLabel + " " + page,
      spec.languageLabel +
        " " +
        field(data.lang.toUpperCase(), 8),
      spec.timeLabel + " " + stamp + " (МСК)",
    ];
    const values = [];
    for (const key of spec.utmKeys)
      if (data.utm?.[key] !== undefined && data.utm[key] !== "")
        values.push(
          key.substring(4) + "=<code>" + f(data.utm[key]!, "utm") + "</code>",
        );
    if (values.length) rows.push(spec.utmLabel + " " + values.join(" · "));
    const html = rows.join("\n");
    if (html.length <= spec.maxUnits) return html;
  }
  throw new Error("message_too_long");
}

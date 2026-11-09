import { animatePropertyDetails } from "./lot-motion";
import { bindZoomCursor } from "./lot-cursor";

// Named constants (previously scattered magic numbers).
const SITE_ORIGIN = "https://chalet40.moscow";
const FETCH_TIMEOUT_MS = 20_000;
const SLIDE_BLUR_PX = 8;
const SLIDE_FADE_OPACITY = 0.84;
const SLIDE_DURATION_MS = 850;
const SLIDE_EASING = "cubic-bezier(.22,.61,.36,1)";
const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

// Lightweight client-side mirror of ../lib/consult (server stays authoritative).
// Duplicated here so the browser bundle does not ship zod + telegram-message.
const CONSULT_METHODS = new Set(["whatsapp", "phone", "telegram", "max"]);
const trimLine = (value: string) => value.replace(/^ +| +$/g, "");
const isOneLine = (value: string) =>
  !/[\u0000-\u001F\u007F\u0085\u2028\u2029\u202A-\u202E\u2066-\u2069\uD800-\uDFFF]/u.test(
    value,
  );
const isConsultLine = (value: unknown, min: number, max: number) => {
  if (typeof value !== "string" || !isOneLine(value)) return false;
  const trimmed = trimLine(value);
  return trimmed.length >= min && trimmed.length <= max;
};

type ConsultValues = {
  name: string;
  method: string;
  contact: string;
  consent: boolean;
  company: string;
  lot?: string;
  lotTitle?: string;
  page: string;
  lang: string | undefined;
  utm: Record<string, string>;
};

function isValidConsult(p: ConsultValues): boolean {
  if (!isConsultLine(p.name, 2, 100) || !isConsultLine(p.contact, 3, 100))
    return false;
  if (!CONSULT_METHODS.has(p.method)) return false;
  const contact = trimLine(p.contact);
  const contactOk =
    p.method === "telegram"
      ? /^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(contact)
      : /^\+?[\d ().-]{7,30}$/.test(contact) &&
        contact.replace(/\D/g, "").length >= 7;
  if (!contactOk || p.consent !== true) return false;
  if (
    p.lot !== undefined &&
    (p.lot.length > 64 || !/^(?:[a-z]+|[PK][1-9]\d*)$/.test(p.lot))
  )
    return false;
  if (p.lotTitle !== undefined && !isConsultLine(p.lotTitle, 0, 80))
    return false;
  if (
    typeof p.page !== "string" ||
    !p.page.startsWith("/") ||
    p.page.length > 500 ||
    !isOneLine(p.page)
  )
    return false;
  if (p.lang !== "ru" && p.lang !== "en") return false;
  if (p.company.length > 200 || !isOneLine(p.company)) return false;
  for (const value of Object.values(p.utm))
    if (value.length > 200 || !isOneLine(value)) return false;
  return true;
}

const consult = document.querySelector<HTMLDialogElement>("#consult-dialog");
const imageDialog =
  document.querySelector<HTMLDialogElement>("#image-dialog");
let imageOpener: HTMLElement | null = null;
if (consult && imageDialog) {
  imageDialog.addEventListener("close", () => {
    imageDialog.querySelector("[data-zoom-mount] img")?.remove();
    if (imageOpener?.isConnected) imageOpener.focus();
    imageOpener = null;
  });
}
// Single delegated click handler. Order matters:
// 1) [data-close-dialog] closes the nearest <dialog>;
// 2) [data-consult] snapshots the lot onto the dialog and opens it;
// 3) [data-zoom] finds an <img> inside the clicked element to show in #image-dialog.
document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const close = target?.closest("[data-close-dialog]");
  if (close) {
    close.closest("dialog")?.close();
    return;
  }
  const trigger = target?.closest<HTMLElement>("[data-consult]");
  if (trigger && consult) {
    // Snapshot the lot at open time so the dialog keeps the lot the user saw,
    // even if the page selection changes while the dialog is open.
    const lot = trigger.dataset.lot ?? document.body.dataset.lot;
    const lotTitle =
      trigger.dataset.lotTitle ?? document.body.dataset.lotTitle;
    if (lot) consult.dataset.lot = lot;
    else delete consult.dataset.lot;
    if (lotTitle) consult.dataset.lotTitle = lotTitle;
    else delete consult.dataset.lotTitle;
    consult
      .querySelector<HTMLElement>(".form-notice")
      ?.replaceChildren();
    consult.showModal();
    return;
  }
  const zoom = target?.closest("[data-zoom]");
  const source = zoom?.querySelector("img");
  if (source && imageDialog) {
    const mount = imageDialog.querySelector("[data-zoom-mount]");
    if (!mount) return;
    let img = mount.querySelector("img");
    if (!img) {
      img = document.createElement("img");
      img.id = "zoom-image";
      img.loading = "eager";
      img.decoding = "async";
      mount.append(img);
    }
    img.src = source.currentSrc || source.src;
    img.alt = source.alt;
    img.width = source.naturalWidth || source.width;
    img.height = source.naturalHeight || source.height;
    imageDialog.classList.toggle(
      "is-photo",
      !!zoom?.closest(".render-preview"),
    );
    imageOpener = zoom instanceof HTMLElement ? zoom : null;
    imageDialog.showModal();
  }
});
for (const dialog of [consult, imageDialog])
  if (dialog)
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) {
        const rect = dialog.getBoundingClientRect();
        if (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        )
          dialog.close();
      }
    });

const dialogForm = document.querySelector<HTMLFormElement>("#consult-form");
const notice = dialogForm?.querySelector<HTMLElement>(".form-notice");
const contactLabel = dialogForm?.querySelector<HTMLElement>(
  "span[data-contact-label]",
);
const contactInput = dialogForm?.querySelector<HTMLInputElement>(
  '[name="contact"]',
);
if (dialogForm && notice && contactLabel && contactInput) {
  const defaultContactLabel = contactLabel.textContent;
  const defaultContactPlaceholder = contactInput.placeholder;
  const updateContactMethod = () => {
    // Fall back to the first method radio when none is checked.
    const method =
      dialogForm.querySelector<HTMLInputElement>(
        '[name="method"]:checked',
      ) ?? dialogForm.querySelector<HTMLInputElement>('[name="method"]');
    if (!method) return;
    contactLabel.textContent =
      method.dataset.contactLabel ?? defaultContactLabel;
    contactInput.placeholder =
      method.dataset.contactPlaceholder ?? defaultContactPlaceholder;
    contactInput.inputMode = method.dataset.inputMode ?? "";
  };
  dialogForm.addEventListener("change", updateContactMethod);
  dialogForm.addEventListener("reset", () =>
    queueMicrotask(updateContactMethod),
  );
  updateContactMethod();
}

for (const form of document.querySelectorAll<HTMLFormElement>(
  "[data-consult-form]",
)) {
  const notice = form.querySelector<HTMLElement>(".form-notice");
  const button = form.querySelector<HTMLButtonElement>("[type=submit]");
  if (!notice || !button) continue;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const fields = new FormData(form);
    const utm: Record<string, string> = {};
    new URLSearchParams(location.search).forEach((value, key) => {
      if ((UTM_KEYS as readonly string[]).includes(key))
        utm[key] = value.slice(0, 200);
    });
    // Resolve the lot at submit time from the freshest source: the dialog
    // snapshot for the consultation dialog, otherwise the live body dataset
    // (parking.ts / lot selection update it dynamically).
    const scope = form.closest<HTMLElement>("#consult-dialog") ?? document.body;
    const lot = scope.dataset.lot || document.body.dataset.lot;
    const lotTitle = scope.dataset.lotTitle || document.body.dataset.lotTitle;
    const values: ConsultValues = {
      name: String(fields.get("name") ?? ""),
      method: String(fields.get("method") ?? ""),
      contact: String(fields.get("contact") ?? ""),
      consent: fields.get("consent") === "on",
      company: String(fields.get("company") ?? ""),
      ...(lot ? { lot, ...(lotTitle ? { lotTitle } : {}) } : {}),
      page: location.pathname,
      lang: document.body.dataset.lang,
      utm,
    };
    if (!isValidConsult(values)) {
      notice.textContent = form.dataset.invalid ?? "";
      notice.focus();
      return;
    }
    const label = button.textContent;
    button.disabled = true;
    button.textContent = form.dataset.sending ?? "";
    notice.textContent = "";
    try {
      const response = await fetch("/api/consult", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          name: trimLine(values.name),
          contact: trimLine(values.contact),
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const result: { ok: boolean; error?: string } = await response.json();
      if (response.ok && result.ok) {
        notice.textContent = form.dataset.success ?? "";
        form.reset();
      } else {
        notice.textContent =
          result.error === "validation_failed"
            ? (form.dataset.invalid ?? "")
            : result.error === "rate_limited"
              ? (form.dataset.rate ?? "")
              : result.error === "service_unavailable"
                ? (form.dataset.unavailable ?? "")
                : (form.dataset.error ?? "");
      }
    } catch {
      notice.textContent = form.dataset.unknown ?? "";
    } finally {
      button.disabled = false;
      button.textContent = label;
      notice.focus();
    }
  });
}

type Selection = {
  areaText: string;
  bodyDescription: string;
  specsText: string;
  statusText: string;
  rateText: string;
  totalText: string;
  id: string;
  path: string;
  name: string;
};
const select = document.querySelector<HTMLElement>("[data-select]");
if (select) {
  const selectionNode = select.querySelector("[data-selection]");
  let choices: Selection[] = [];
  try {
    choices = selectionNode?.textContent
      ? (JSON.parse(selectionNode.textContent) as Selection[])
      : [];
  } catch {
    choices = [];
  }
  const initial = select.dataset.initialLot;
  const buildingPath = select.dataset.buildingPath;
  const requiredSelectors = [
    "[data-select-heading]",
    "[data-select-area]",
    "[data-select-description]",
    "[data-select-rate]",
    "[data-select-total]",
    ".selection-price",
    "[data-select-plan]",
  ];
  const ready =
    choices.length > 0 &&
    !!initial &&
    !!buildingPath &&
    requiredSelectors.every((s) => select.querySelector(s));
  if (ready && initial && buildingPath) {
    const initialHead = {
      title: document.title,
      description:
        document.querySelector<HTMLMetaElement>(
          "meta[name=description]",
        )?.content ?? "",
      json:
        document.querySelector('script[type="application/ld+json"]')
          ?.textContent ?? "",
    };
    let displayed = initial;
    let stopSelectionMotion = () => {};
    // SEO tags are intentionally reset to the page's initial values on every
    // lot switch: the ?lot= deep link is a UI state, not a separate document,
    // so title/canonical/hreflang must not change per selection.
    const show = (id: string, path: string) => {
      stopSelectionMotion();
      const choice = choices.find((c) => c.id === id);
      if (!choice) return;
      for (const slide of select.querySelectorAll<HTMLElement>(
        "[data-slide]",
      ))
        slide.hidden = slide.dataset.slide !== id;
      if (
        displayed !== id &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        const slide = Array.from(
          select.querySelectorAll<HTMLElement>("[data-slide]"),
        ).find((item) => item.dataset.slide === id);
        slide?.animate(
          [
            { filter: `blur(${SLIDE_BLUR_PX}px)`, opacity: SLIDE_FADE_OPACITY },
            { filter: "blur(0)", opacity: 1 },
          ],
          { duration: SLIDE_DURATION_MS, easing: SLIDE_EASING },
        );
      }
      displayed = id;
      for (const link of select.querySelectorAll<HTMLElement>(
        "[data-select-lot]",
      )) {
        if (link.dataset.selectLot === id)
          link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      }
      const heading = select.querySelector<HTMLElement>(
        "[data-select-heading]",
      );
      if (heading) heading.textContent = choice.name;
      document.body.dataset.lot = id;
      document.body.dataset.lotTitle = choice.name;
      for (const [selector, value] of Object.entries({
        "[data-select-area]": choice.areaText,
        "[data-select-description]": choice.bodyDescription,
        "[data-select-specs]": choice.specsText,
        "[data-select-status]": choice.statusText,
        "[data-select-rate]": choice.rateText,
        "[data-select-total]": choice.totalText,
      })) {
        const node = select.querySelector(selector);
        if (node) node.textContent = value;
      }
      const price = select.querySelector<HTMLElement>(".selection-price");
      if (price) price.hidden = !choice.rateText;
      const plan = select.querySelector<HTMLAnchorElement>("[data-select-plan]");
      if (plan) plan.href = choice.path;
      if (heading)
        stopSelectionMotion = animatePropertyDetails(select, heading);
      document.title = initialHead.title;
      const descriptionMeta = document.querySelector<HTMLMetaElement>(
        "meta[name=description]",
      );
      if (descriptionMeta) descriptionMeta.content = initialHead.description;
      for (const [key, value] of Object.entries({
        title: initialHead.title,
        description: initialHead.description,
        url: new URL(path, SITE_ORIGIN).href,
      })) {
        const meta = document.querySelector<HTMLMetaElement>(
          `meta[property="og:${key}"]`,
        );
        if (meta) meta.content = value;
      }
      const canonical = document.querySelector<HTMLLinkElement>(
        "link[rel=canonical]",
      );
      if (canonical)
        canonical.href = new URL(path, SITE_ORIGIN).href;
      const base = path.replace(/^\/en(?=\/|$)/, "");
      for (const link of document.querySelectorAll<HTMLLinkElement>(
        "link[hreflang]",
      ))
        link.href = new URL(
          link.hreflang === "en" ? `/en${base}` : base,
          SITE_ORIGIN,
        ).href;
      for (const link of document.querySelectorAll<HTMLAnchorElement>(
        ".header-language, .navigation-languages a, .footer-languages a",
      ))
        link.href = link.lang === "en" ? `/en${base}` : base;
      const script = document.querySelector(
        'script[type="application/ld+json"]',
      );
      if (script) script.textContent = initialHead.json;
    };
    const selectedFromUrl = () => {
      const id = new URL(location.href).searchParams.get("lot");
      return choices.find((choice) => choice.id === id)?.id ?? initial;
    };
    const selectionUrl = (id: string) => {
      const url = new URL(location.href);
      url.pathname = buildingPath;
      url.searchParams.set("lot", id);
      return url.pathname + url.search + url.hash;
    };
    const selected = selectedFromUrl();
    history.replaceState({ selection: selected }, "", location.href);
    show(selected, buildingPath);
    select.addEventListener("click", (event) => {
      if (
        !(event instanceof MouseEvent) ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("[data-select-lot]")
          : null;
      if (!target) return;
      const choice = choices.find((c) => c.id === target.dataset.selectLot);
      if (!choice) return;
      event.preventDefault();
      history.pushState(
        { selection: choice.id },
        "",
        selectionUrl(choice.id),
      );
      show(choice.id, buildingPath);
    });
    window.addEventListener("popstate", () => {
      show(selectedFromUrl(), buildingPath);
    });
  }
}

// Content remains visible without scripting; the observer only adds a reveal animation.
if (
  !matchMedia("(prefers-reduced-motion: reduce)").matches &&
  "IntersectionObserver" in window
) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        if (entry.isIntersecting) {
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        }
    },
    { threshold: 0.12 },
  );
  for (const section of document.querySelectorAll("[data-reveal]"))
    observer.observe(section);
}

const lotRoot = document.querySelector<HTMLElement>(".property-layout");
const lotHeading = document.querySelector<HTMLElement>(".page-heading");
if (lotRoot && lotHeading) {
  bindZoomCursor(lotRoot);
  animatePropertyDetails(lotRoot, lotHeading);
}


document.querySelectorAll<HTMLElement>('.office-selector__targets').forEach(nav=>{
 const scene=nav.closest<HTMLElement>('.home-gallery-scene-0,.office-selector');
 if(!scene)return;
 const position=()=>{const w=scene.clientWidth,h=scene.clientHeight;const scale=Math.max(w/5079,h/3677);const rw=5079*scale,rh=3677*scale;
 for(const link of nav.querySelectorAll<HTMLElement>('a[data-anchor-x]')){const x=Number(link.dataset.anchorX),y=Number(link.dataset.anchorY);
  const anchorX=(w-rw)/2+x*rw;
  const inset=20+link.offsetWidth/2;
  const left=w<=767?Math.max(inset,Math.min(anchorX,w-inset)):anchorX;
  link.style.left=`${Math.round(left)}px`;link.style.top=`${Math.round((h-rh)/2+y*rh)}px`;
 }
 };
 new ResizeObserver(position).observe(scene);
 document.fonts.ready.then(position);
 position();
});

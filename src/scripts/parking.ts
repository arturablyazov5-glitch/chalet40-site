import { animatePropertyDetails } from "./lot-motion";
import { parkingScale } from "../lib/parking-scale";
type Card = {
  id: string;
  sizeClass: string | null;
  type: string;
  typeText: string;
  lotTitle: string;
  areaText: string;
  rateText: string;
  totalText: string;
  priceText: string;
  statusText: string;
  status: string;
};

// Zoom/pan tuning, in SVG viewBox units.
const ZOOM_MIN = 1 / 1.1;
const ZOOM_MAX = 1 / 0.12;
const ZOOM_IN_STEP = 0.25; // scale(zoom * ZOOM_IN_STEP) on zoom-in
const ZOOM_OUT_STEP = 0.2; // scale(-zoom * ZOOM_OUT_STEP) on zoom-out
const WHEEL_ZOOM = 0.8; // per-notch zoom factor on the wheel
const PAN_STEP = 80; // pan distance in px at zoom = 1
const RESET_ZOOM_THRESHOLD = 1 / 0.98;
const RESET_PAN_THRESHOLD = 1;

// Tooltip placement offsets in px.
const TOOLTIP_EDGE = 8;
const TOOLTIP_OFFSET = 14;

const root = document.querySelector<HTMLElement>("[data-parking]");
if (root) {
  const cards = JSON.parse(
    root.querySelector("[data-parking-items]")!.textContent!,
  ) as Card[];
  const plan = root.querySelector<HTMLElement>(".parking-plan")!;
  const svg = root.querySelector<SVGSVGElement>("[data-parking-svg]")!;
  const panel = root.querySelector<HTMLElement>("[data-card]")!;
  panel.hidden = true;
  const tooltip = root.querySelector<HTMLElement>(".parking-tooltip")!;
  const live = root.querySelector<HTMLElement>("[data-parking-live]")!;
  let stopNumbers: (() => void) | undefined;
  const animateCard = () => {
    stopNumbers?.();
    stopNumbers = animatePropertyDetails(panel.querySelector("dl")!, undefined, {
      delay: 350,
      duration: 1400,
    });
  };
  // Implicit coupling: the header language switcher carries the selected lot
  // in its ?lot= param so it survives locale switches.
  const language = document.querySelector<HTMLAnchorElement>(
    ".site-header .header-language",
  );
  const syncLanguage = (id: string | null) => {
    if (!language?.href) return;
    const url = new URL(language.href);
    if (id) url.searchParams.set("lot", id.toLowerCase());
    else url.searchParams.delete("lot");
    language.href = url.pathname + url.search;
  };
  let selected: string | null = null;
  let preview = cards[0]!.id;
  const display = (id: string, announce = false, highlight = true) => {
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    stopNumbers?.();
    preview = id;
    const selectedCard = cards.find((item) => item.id === selected);
    if (selectedCard) {
      document.body.dataset.lot = selectedCard.id;
      document.body.dataset.lotTitle = selectedCard.lotTitle;
    } else {
      delete document.body.dataset.lot;
      delete document.body.dataset.lotTitle;
    }
    syncLanguage(selected);
    root.querySelector<HTMLElement>("[data-consult]")!.dataset.lotTitle =
      card.lotTitle;
    root.querySelector<HTMLElement>("[data-consult]")!.dataset.lot = card.id;
    root.querySelector("[data-card-id]")!.textContent = card.id;
    root.querySelector("[data-card-type]")!.textContent = card.typeText;
    const setField = (key: "area" | "status" | "total", text: string) => {
      const field = root.querySelector(`[data-card-field=${key}]`);
      if (field) field.textContent = text;
    };
    setField("area", card.areaText);
    setField("status", card.statusText);
    // priceText matches the SSR currency() format exactly — no flicker.
    setField("total", card.priceText);
    panel.dataset.status = card.status;
    const totalRow = panel.querySelector(
      "[data-card-field=total]",
    )?.closest<HTMLElement>("dl > div");
    if (totalRow) totalRow.hidden = card.status !== "available";
    panel.querySelector<HTMLElement>("[data-consult]")!.hidden =
      card.status !== "available";
    for (const group of root.querySelectorAll<SVGGElement>(
      "[data-parking-id]",
    )) {
      group.classList.toggle(
        "is-preview",
        highlight && group.dataset.parkingId === id,
      );
      group.classList.toggle(
        "is-selected",
        group.dataset.parkingId === selected,
      );
      if (group.hasAttribute("aria-pressed"))
        group.setAttribute(
          "aria-pressed",
          String(group.dataset.parkingId === selected),
        );
    }
    for (const row of root.querySelectorAll<HTMLElement>("[data-parking-row]"))
      row.classList.toggle("is-selected", row.dataset.parkingRow === selected);
    if (announce)
      live.textContent = `${card.typeText} ${card.id}. ${card.areaText}. ${card.rateText}. ${card.totalText}. ${card.statusText}.`;
  };
  const writeLotParam = (id: string | null, push: boolean) => {
    const params = new URLSearchParams(location.search);
    if (id) params.set("lot", id.toLowerCase());
    else params.delete("lot");
    const url =
      location.pathname + (params.size ? "?" + params.toString() : "");
    const state = id ? { lot: id } : {};
    if (push) history.pushState(state, "", url);
    else history.replaceState(state, "", url);
  };
  // Single entry point for selection changes: pick pushes history (deduped
  // on repeat picks of the same id), clear/Escape/popstate/initial do not.
  const applySelection = (
    id: string,
    options: { history?: "push" | "replace" | "none"; announce?: boolean } = {},
  ) => {
    const { history = "none", announce = false } = options;
    const repeat = selected === id;
    selected = id;
    document.body.classList.add("parking-panel-open");
    panel.hidden = false;
    tooltip.hidden = true;
    if (history === "push") writeLotParam(id, !repeat);
    else if (history === "replace") writeLotParam(id, false);
    display(id, announce);
    animateCard();
  };
  const pick = (id: string) =>
    applySelection(id, { history: "push", announce: true });
  const clearSelection = () => {
    selected = null;
    syncLanguage(null);
    document.body.classList.remove("parking-panel-open");
    panel.hidden = true;
    writeLotParam(null, false);
    display(preview, false, false);
    // The consult button sits inside the now-hidden panel; drop stale lot data.
    const consult = root.querySelector<HTMLElement>("[data-consult]");
    if (consult) {
      delete consult.dataset.lot;
      delete consult.dataset.lotTitle;
    }
    live.textContent = "";
  };
  const target = (event: Event) =>
    event.target instanceof Element
      ? event.target.closest<SVGGElement>(
          "[data-parking-id],[data-parking-zone]",
        )
      : null;
  const hideTooltip = () => {
    tooltip.hidden = true;
  };
  // Tooltip content is cheap to cache per card; positioning is rAF-throttled
  // because pointermove fires far more often than frames.
  let tipCard: Card | null = null;
  let tipGroup: SVGGElement | null = null;
  let tipX = 0;
  let tipY = 0;
  let tipFromPointer = false;
  let tipFrame = 0;
  const positionTooltip = () => {
    tipFrame = 0;
    if (tooltip.hidden || !tipGroup) return;
    const rect = tipGroup.getBoundingClientRect();
    const x = tipFromPointer ? tipX : rect.right;
    const y = tipFromPointer ? tipY : rect.top;
    const box = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(TOOLTIP_EDGE, Math.min(x + TOOLTIP_OFFSET, innerWidth - box.width - TOOLTIP_EDGE))}px`;
    tooltip.style.top = `${Math.max(TOOLTIP_EDGE, y - box.height - TOOLTIP_OFFSET)}px`;
  };
  const previewEvent = (event: Event) => {
    const group = target(event);
    const card = cards.find((card) => card.id === group?.dataset.parkingId);
    if (!card || !group) {
      hideTooltip();
      return;
    }
    // display() rebuilds the whole card — run it only when the previewed lot
    // actually changes (focusin still re-announces for screen readers).
    if (!selected && (card.id !== preview || event.type === "focusin"))
      display(card.id, event.type === "focusin");
    if (tipCard !== card) {
      tipCard = card;
      tooltip.querySelector("[data-tip-title]")!.textContent =
        `${card.typeText} ${card.id}`;
      tooltip.querySelector("[data-tip-status]")!.textContent = card.statusText;
      tooltip.querySelector("[data-tip-area]")!.textContent = card.areaText;
      tooltip.querySelector("[data-tip-total]")!.textContent = card.totalText;
      tooltip.querySelector<HTMLElement>("[data-tip-price-row]")!.hidden =
        card.status !== "available";
      tooltip.dataset.status = card.status;
    }
    tooltip.hidden = false;
    tipGroup = group;
    tipFromPointer = event instanceof PointerEvent;
    if (tipFromPointer) {
      tipX = (event as PointerEvent).clientX;
      tipY = (event as PointerEvent).clientY;
    }
    if (!tipFrame) tipFrame = requestAnimationFrame(positionTooltip);
  };
  plan.addEventListener("pointerover", previewEvent);
  plan.addEventListener("pointermove", previewEvent);
  plan.addEventListener("focusin", previewEvent);
  plan.addEventListener("pointerleave", () => {
    hideTooltip();
    if (!selected) display(cards[0]!.id, false, false);
  });
  plan.addEventListener("focusout", hideTooltip);
  plan.addEventListener("click", (event) => {
    const group = target(event);
    if (group?.dataset.parkingId) pick(group.dataset.parkingId);
    else if (group?.dataset.parkingZone)
      live.textContent = group.dataset.parkingZone;
  });
  root.addEventListener("click", (event) => {
    const button =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-pick-parking]")
        : null;
    if (button?.dataset.pickParking) {
      pick(button.dataset.pickParking);
      root.querySelector<HTMLElement>("[data-card-id]")?.scrollIntoView({
        block: "nearest",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    }
  });
  root
    .querySelector("[data-clear-selection]")!
    .addEventListener("click", clearSelection);
  // Plan viewBox size (both floor SVGs share 0 0 1521 926).
  const planBox = svg.viewBox.baseVal;
  const PLAN_WIDTH = planBox.width || Number(svg.getAttribute("width")) || 0;
  const PLAN_HEIGHT = planBox.height || Number(svg.getAttribute("height")) || 0;
  let zoom = 1;
  let x = 0;
  let y = 0;
  const scaleNode = root.querySelector<HTMLElement>(".parking-scale")!;
  const scaleLine = scaleNode.querySelector<HTMLElement>(".scale-bar-line")!;
  let lastMeters = 0;
  const updateScale = () => {
    const matrix = svg.getScreenCTM();
    if (!matrix || matrix.a <= 0) return;
    const result = parkingScale(
      matrix.a,
      lastMeters,
      Number(scaleNode.dataset.metersPerUnit),
    );
    lastMeters = result.meters;
    scaleLine.hidden = false;
    scaleNode.hidden = false;
    svg.querySelector("[data-scale-initial]")?.setAttribute("display", "none");
    scaleLine.style.width = `${result.pixels}px`;
    scaleNode.querySelector(".scale-bar-label")!.textContent =
      result.meters >= 1000
        ? `${result.meters / 1000} ${scaleNode.dataset.kilometer}`
        : `${result.meters} ${scaleNode.dataset.meter}`;
  };
  new ResizeObserver(updateScale).observe(svg);
  const clampZoom = (value: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value));
  const resetButton = root.querySelector<HTMLButtonElement>("[data-reset-plan]")!;
  const update = () => {
    const w = PLAN_WIDTH / zoom,
      h = PLAN_HEIGHT / zoom;
    x = Math.max(-w * 0.3, Math.min(x, PLAN_WIDTH - w * 0.7));
    y = Math.max(-h * 0.3, Math.min(y, PLAN_HEIGHT - h * 0.7));
    svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
    resetButton.hidden = !(
      zoom > RESET_ZOOM_THRESHOLD ||
      Math.abs(x) > RESET_PAN_THRESHOLD ||
      Math.abs(y) > RESET_PAN_THRESHOLD
    );
    updateScale();
  };
  const scale = (delta: number) => {
    const old = zoom;
    zoom = clampZoom(zoom + delta);
    x += PLAN_WIDTH / old / 2 - PLAN_WIDTH / zoom / 2;
    y += PLAN_HEIGHT / old / 2 - PLAN_HEIGHT / zoom / 2;
    update();
  };
  const zoomAt = (next: number, clientX: number, clientY: number) => {
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(clientX, clientY).matrixTransform(
      matrix.inverse(),
    );
    const old = zoom;
    zoom = clampZoom(next);
    x = point.x - ((point.x - x) * old) / zoom;
    y = point.y - ((point.y - y) * old) / zoom;
    update();
  };
  plan.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      hideTooltip();
      zoomAt(
        zoom * (event.deltaY < 0 ? 1 / WHEEL_ZOOM : WHEEL_ZOOM),
        event.clientX,
        event.clientY,
      );
    },
    { passive: false },
  );
  const pointers = new Map<number, { x: number; y: number }>();
  let moved = false;
  let pinchDistance = 0;
  plan.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    moved = false;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDistance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
  });
  plan.addEventListener("pointermove", (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const dx = event.clientX - previous.x,
      dy = event.clientY - previous.y;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
    if (!moved) return;
    hideTooltip();
    plan.setPointerCapture(event.pointerId);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinchDistance > 0)
        zoomAt(
          (zoom * distance) / pinchDistance,
          (a!.x + b!.x) / 2,
          (a!.y + b!.y) / 2,
        );
      pinchDistance = distance;
    } else {
      const matrix = svg.getScreenCTM();
      if (matrix) {
        x -= dx / matrix.a;
        y -= dy / matrix.d;
        update();
      }
    }
  });
  for (const name of ["pointerup", "pointercancel"] as const)
    plan.addEventListener(name, (event) => {
      pointers.delete(event.pointerId);
      if (plan.hasPointerCapture(event.pointerId))
        plan.releasePointerCapture(event.pointerId);
    });
  plan.addEventListener(
    "click",
    (event) => {
      if (moved) {
        event.stopImmediatePropagation();
        event.preventDefault();
        moved = false;
      }
    },
    true,
  );
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      clearSelection();
      plan.focus();
    }
  });
  // Keyboard-only panning (arrow keys on the plan); there are no [data-pan]
  // buttons in the markup.
  const pan = (direction: string) => {
    const step = PAN_STEP / zoom;
    if (direction === "left") x -= step;
    if (direction === "right") x += step;
    if (direction === "up") y -= step;
    if (direction === "down") y += step;
    update();
  };
  root
    .querySelector("[data-zoom-in]")!
    .addEventListener("click", () => scale(zoom * ZOOM_IN_STEP));
  root
    .querySelector("[data-zoom-out]")!
    .addEventListener("click", () => scale(-zoom * ZOOM_OUT_STEP));
  resetButton.addEventListener("click", () => {
    zoom = 1;
    x = 0;
    y = 0;
    update();
  });
  plan.addEventListener("keydown", (event) => {
    const group = target(event);
    if (event.key === "Enter" || event.key === " ") {
      if (group?.dataset.parkingId) {
        event.preventDefault();
        pick(group.dataset.parkingId);
      } else if (group?.dataset.parkingZone) {
        event.preventDefault();
        live.textContent = group.dataset.parkingZone;
      }
    }
    if (
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    ) {
      event.preventDefault();
      pan(event.key.replace("Arrow", "").toLowerCase());
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      scale(zoom * ZOOM_IN_STEP);
    }
    if (event.key === "-") {
      event.preventDefault();
      scale(-zoom * ZOOM_OUT_STEP);
    }
    if (event.key === "Escape") clearSelection();
  });
  root
    .querySelector("[data-share-parking]")
    ?.addEventListener("click", async () => {
      const params = new URLSearchParams(location.search);
      if (selected) params.set("lot", selected.toLowerCase());
      try {
        await navigator.clipboard.writeText(
          location.origin + location.pathname + "?" + params.toString(),
        );
      } catch {
        /* Keep the shareable URL in the address bar. */
      }
    });
  window.addEventListener("popstate", () => {
    const id = new URLSearchParams(location.search).get("lot")?.toUpperCase();
    if (id && cards.some((card) => card.id === id)) applySelection(id);
    else clearSelection();
  });
  const initial = new URLSearchParams(location.search)
    .get("lot")
    ?.toUpperCase();
  if (initial && cards.some((card) => card.id === initial))
    applySelection(initial);
  else display(cards[0]!.id, false, false);
}

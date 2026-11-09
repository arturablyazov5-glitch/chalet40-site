export interface ScreenScrollOptions {
  /** Screen elements or a selector matching them. Fewer than two → no-op. */
  screens: string | readonly HTMLElement[];
  /** Lock time between animated jumps, ms. Default 700. */
  lockMs?: number;
  /** Media query that must match for wheel handling (cached MediaQueryList). */
  wheelMedia?: string;
  /** ArrowUp/ArrowDown navigate by screen. Default false. */
  arrowKeys?: boolean;
  /** Vertical touch swipes navigate by screen. Default false. */
  touch?: boolean;
  /** Block wheel gestures that start inside editable elements. Default false. */
  blockWheelEditable?: boolean;
  /** Block key/touch gestures that start inside editable elements. Default true. */
  blockEditable?: boolean;
  /** Tall screens on wheel: "native" leaves inner scrolling to the browser,
   * "step" jumps by one viewport. Keys and touch always step. Default "step". */
  wheelTall?: "native" | "step";
  /** Element marking the page end: wheel-down past its top is left native. */
  endBoundary?: HTMLElement | null;
  /** Horizontal scroller (gallery): at its top edge, gestures scroll it
   * sideways by one child instead of advancing the page. */
  horizontal?: HTMLElement | null;
  /** Swallow gestures even when no further screen exists. Default false. */
  handledAtEnd?: boolean;
  /** Accumulate wheel deltaY and only trigger past this magnitude. Default 0. */
  wheelDeltaThreshold?: number;
}

const EDITABLE =
  "input, textarea, select, [contenteditable]:not([contenteditable='false'])";
const SWIPE_AXIS_THRESHOLD = 8;
const SWIPE_MIN_DISTANCE = 24;

/**
 * Full-page "screen" scroller shared by the landing pages. Wheel, arrow keys
 * and touch swipes jump between `screens`; each page opts into the subset of
 * input it needs via the options above.
 */
export function initScreenScroll(options: ScreenScrollOptions): void {
  const screens =
    typeof options.screens === "string"
      ? [...document.querySelectorAll<HTMLElement>(options.screens)]
      : [...options.screens];
  if (screens.length < 2) return;
  const lockMs = options.lockMs ?? 700;
  const wheelMedia = options.wheelMedia
    ? matchMedia(options.wheelMedia)
    : null;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const scrollBehavior = (): ScrollBehavior =>
    reducedMotion.matches ? "instant" : "smooth";
  const blockEditable = options.blockEditable ?? true;
  let lockedUntil = 0;
  let wheelDelta = 0;

  const dialogOpen = () => !!document.querySelector("dialog[open]");
  const inEditable = (target: EventTarget | null) =>
    target instanceof Element && !!target.closest(EDITABLE);
  const blocked = (target: EventTarget | null, editable: boolean) =>
    dialogOpen() || (editable && inEditable(target));

  /** True when the gesture starts inside a vertically scrollable container;
   * such swipes are left to native scrolling. */
  const verticallyScrollable = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    for (
      let node: Element | null = target;
      node && node !== document.documentElement;
      node = node.parentElement
    ) {
      const { overflowY } = getComputedStyle(node);
      if (overflowY !== "auto" && overflowY !== "scroll") continue;
      if (node.scrollHeight > node.clientHeight + 1) return true;
    }
    return false;
  };

  const advance = (
    direction: number,
    via: "wheel" | "key" | "touch",
    repeat = false,
  ): boolean => {
    const y = scrollY;
    const positions = screens.map(
      (screen) => screen.getBoundingClientRect().top + y,
    );
    const current = screens.find(
      (screen, i) =>
        y >= positions[i]! - 2 &&
        y < positions[i]! + screen.offsetHeight - 2,
    );

    let topTarget: number | undefined;
    let inner = false;
    if (current && current.offsetHeight > innerHeight + 2) {
      const top = current.getBoundingClientRect().top + y;
      const bottom = top + current.offsetHeight - innerHeight;
      if (
        (direction > 0 && y < bottom - 2) ||
        (direction < 0 && y > top + 2)
      ) {
        if (via === "wheel" && options.wheelTall === "native") return false;
        inner = true;
        topTarget = Math.max(
          top,
          Math.min(y + direction * innerHeight, bottom),
        );
      }
    }
    if (!inner && options.endBoundary) {
      const boundaryTop =
        options.endBoundary.getBoundingClientRect().top + y;
      if (y > boundaryTop + 2 && direction > 0) return false;
    }

    // A horizontal scroller (gallery) takes over at its top edge.
    let horizontalTarget: number | undefined;
    const horizontal = options.horizontal;
    if (topTarget === undefined && horizontal) {
      const galleryTop = horizontal.getBoundingClientRect().top + y;
      if (Math.abs(y - galleryTop) < 5) {
        const index = Math.round(horizontal.scrollLeft / horizontal.clientWidth);
        const next = index + direction;
        if (next >= 0 && next < horizontal.children.length)
          horizontalTarget = next;
      }
    }
    if (topTarget === undefined && horizontalTarget === undefined) {
      topTarget =
        direction > 0
          ? positions.find((top) => top > y + 5)
          : [...positions].reverse().find((top) => top < y - 5);
    }
    if (topTarget === undefined && horizontalTarget === undefined)
      return options.handledAtEnd ?? false;
    if (repeat || Date.now() < lockedUntil) return true;
    lockedUntil = Date.now() + lockMs;
    if (horizontalTarget !== undefined)
      horizontal!.scrollTo({
        left: horizontalTarget * horizontal!.clientWidth,
        behavior: scrollBehavior(),
      });
    else scrollTo({ top: topTarget, behavior: scrollBehavior() });
    return true;
  };

  window.addEventListener(
    "wheel",
    (event) => {
      if (
        event.ctrlKey ||
        !event.deltaY ||
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
        (wheelMedia && !wheelMedia.matches) ||
        blocked(event.target, options.blockWheelEditable ?? false)
      )
        return;
      const threshold = options.wheelDeltaThreshold ?? 0;
      if (threshold > 0) {
        // Drosсель: small trackpad deltas accumulate until they add up.
        wheelDelta += event.deltaY;
        if (Math.abs(wheelDelta) < threshold) return;
        const direction = Math.sign(wheelDelta);
        wheelDelta = 0;
        if (advance(direction, "wheel")) event.preventDefault();
        return;
      }
      if (advance(Math.sign(event.deltaY), "wheel"))
        event.preventDefault();
    },
    { passive: false },
  );

  if (options.arrowKeys)
    window.addEventListener("keydown", (event) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        !["ArrowDown", "ArrowUp"].includes(event.key) ||
        blocked(event.target, blockEditable)
      )
        return;
      if (event.repeat || advance(event.key === "ArrowDown" ? 1 : -1, "key"))
        event.preventDefault();
    });

  if (options.touch) {
    let swipe: {
      x: number;
      y: number;
      axis: "x" | "y" | null;
      blocked: boolean;
    } | null = null;
    window.addEventListener(
      "touchstart",
      (event) => {
        swipe = null;
        if (
          event.touches.length !== 1 ||
          blocked(event.target, blockEditable) ||
          verticallyScrollable(event.target)
        )
          return;
        const touch = event.touches[0]!;
        swipe = {
          x: touch.clientX,
          y: touch.clientY,
          axis: null,
          blocked: Date.now() < lockedUntil,
        };
      },
      { passive: true },
    );
    window.addEventListener(
      "touchmove",
      (event) => {
        if (!swipe || event.touches.length !== 1) {
          swipe = null;
          return;
        }
        const touch = event.touches[0]!;
        const dx = touch.clientX - swipe.x,
          dy = touch.clientY - swipe.y;
        if (
          swipe.axis === null &&
          Math.max(Math.abs(dx), Math.abs(dy)) >= SWIPE_AXIS_THRESHOLD
        )
          swipe.axis = Math.abs(dy) >= Math.abs(dx) ? "y" : "x";
        // Horizontal gestures stay native (e.g. the gallery); vertical ones
        // advance the page.
        if (swipe.axis === "y" && event.cancelable)
          event.preventDefault();
      },
      { passive: false },
    );
    window.addEventListener(
      "touchend",
      (event) => {
        const gesture = swipe;
        swipe = null;
        if (
          !gesture ||
          gesture.blocked ||
          gesture.axis !== "y" ||
          !event.changedTouches.length
        )
          return;
        const distance = gesture.y - event.changedTouches[0]!.clientY;
        if (Math.abs(distance) >= SWIPE_MIN_DISTANCE)
          advance(Math.sign(distance), "touch");
      },
      { passive: true },
    );
    window.addEventListener(
      "touchcancel",
      () => {
        swipe = null;
      },
      { passive: true },
    );
  }
}

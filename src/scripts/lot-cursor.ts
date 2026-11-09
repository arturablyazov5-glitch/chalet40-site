/** One glass magnifier follows a fine pointer over the three diagram buttons. */
export function bindZoomCursor(root: HTMLElement) {
  const media = matchMedia('(hover: hover) and (pointer: fine)');
  let layer: HTMLDivElement;
  let cursor: HTMLDivElement;
  let active: HTMLElement | null = null;
  let frame = 0;
  let x = 0;
  let y = 0;

  function createCursor() {
    layer = document.createElement('div');
    layer.className = 'zoom-cursor-layer';
    layer.setAttribute('aria-hidden', 'true');
    cursor = document.createElement('div');
    cursor.className = 'zoom-cursor';
    const disc = document.createElement('span');
    disc.className = 'zoom-cursor-disc';
    const ns = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(ns, 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '1.5');
    icon.setAttribute('stroke-linecap', 'round');
    const lens = document.createElementNS(ns, 'circle');
    lens.setAttribute('cx', '10.5');
    lens.setAttribute('cy', '10.5');
    lens.setAttribute('r', '6');
    const handle = document.createElementNS(ns, 'path');
    handle.setAttribute('d', 'M15 15 20 20');
    icon.append(lens, handle);
    disc.append(icon);
    cursor.append(disc);
    layer.append(cursor);
    document.body.append(layer);
  }

  // Cache whether a modal <dialog> is open; recompute only on rare toggle events
  // instead of querying the DOM on every pointermove.
  let dialogOpen = !!document.querySelector('dialog[open]');
  const syncDialogOpen = () => {
    dialogOpen = !!document.querySelector('dialog[open]');
  };
  document.addEventListener('toggle', syncDialogOpen, true);

  function position() {
    const half = cursor.offsetWidth / 2;
    cursor.style.transform = 'translate3d(' + (x - half) + 'px,' + (y - half) + 'px,0)';
  }

  function hide() {
    cancelAnimationFrame(frame);
    frame = 0;
    active?.classList.remove('has-zoom-cursor');
    active = null;
    cursor?.classList.remove('is-visible', 'is-pressed');
  }

  function move(event: PointerEvent) {
    if (!media.matches || event.pointerType === 'touch' || dialogOpen) return hide();
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('button[data-zoom]') : null;
    if (!target || !root.contains(target)) return hide();
    if (!cursor) createCursor();
    x = event.clientX;
    y = event.clientY;
    if (active !== target) {
      active?.classList.remove('has-zoom-cursor');
      active = target;
      position();
      active.classList.add('has-zoom-cursor');
      cursor.classList.add('is-visible');
    }
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; position(); });
  }

  root.addEventListener('pointerover', move);
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerleave', hide);
  root.addEventListener('pointerdown', () => { if (active) cursor.classList.add('is-pressed'); });
  root.addEventListener('pointerup', () => cursor?.classList.remove('is-pressed'));
  root.addEventListener('pointercancel', hide);
  root.addEventListener('click', hide);
  document.addEventListener('keydown', hide);
  document.addEventListener('scroll', hide, {capture: true, passive: true});
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
  window.addEventListener('blur', hide);
  window.addEventListener('resize', hide);
  media.addEventListener('change', hide);
  const observer = new MutationObserver(hide);
  observer.observe(root, {childList: true});
  window.addEventListener('pagehide', () => observer.disconnect(), {once: true});
}

// Named timing constants (previously scattered magic numbers).
const COUNT_STAGGER_MS = 45;
const COUNT_STAGGER_CAP_MS = 200;
const COUNT_DURATION_EARLY_MS = 1050;
const COUNT_DURATION_LATE_MS = 1250;
const EARLY_COUNT_LIMIT = 5;
const LETTER_STAGGER_MS = 9;
const LETTER_STAGGER_CAP_MS = 300;
const LONG_NUMBER_DIGITS = 12;

/** Keep the original text available and reserve its exact width during counting. */
export function formatCount(token: string, progress: number) {
  if (progress >= 1) return token;
  const commaGrouping = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(token);
  const decimal = token.match(commaGrouping ? /(\.)(\d+)$/ : /([,.])(\d+)$/);
  const precision = decimal?.[2].length ?? 0;
  const group = commaGrouping ? ',' : token.match(/[ \u00a0\u202f]/)?.[0];
  const target = Number(token.replace(commaGrouping ? /,/g : /[ \u00a0\u202f]/g, '').replace(',', '.'));
  if (!Number.isFinite(target)) return token;
  const [integer, fraction] = (target * Math.max(0, progress)).toFixed(precision).split('.');
  const grouped = group ? integer.replace(/\B(?=(\d{3})+(?!\d))/g, group) : integer;
  return grouped + (precision ? decimal![1] + fraction : '');
}

export function animatePropertyDetails(
  root: HTMLElement,
  heading?: HTMLElement,
  options: { delay?: number; duration?: number } = {},
) {
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  if (media.matches) return () => {};
  const tasks: {counter: HTMLElement; readout: HTMLElement; token: string; start: number; duration: number}[] = [];
  let frame = 0;
  const started = performance.now() + (options.delay ?? 0);
  const targets = root.querySelectorAll('[data-count-value], .price-primary, .price-total');

  targets.forEach((target, index) => {
    const original = target.textContent ?? '';
    const color = getComputedStyle(target).color;
    const fragment = document.createDocumentFragment();
    let end = 0;
    for (const match of original.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d(?:[\d \u00a0\u202f]*\d)?(?:[,.]\d+)?/g)) {
      fragment.append(document.createTextNode(original.slice(end, match.index)));
      const token = match[0];
      // Long unbroken identifiers should retain normal word wrapping.
      if (token.replace(/\D/g, '').length > LONG_NUMBER_DIGITS) {
        fragment.append(document.createTextNode(token));
      } else {
        const counter = document.createElement('span');
        counter.className = 'count-number is-counting';
        counter.style.setProperty('--count-color', color);
        const final = document.createElement('span');
        final.className = 'count-final';
        final.textContent = token;
        const readout = document.createElement('span');
        readout.className = 'count-readout';
        readout.setAttribute('aria-hidden', 'true');
        readout.dataset.value = formatCount(token, 0);
        counter.append(final, readout);
        fragment.append(counter);
        tasks.push({
          counter,
          readout,
          token,
          start: started + Math.min(index * COUNT_STAGGER_MS, COUNT_STAGGER_CAP_MS),
          duration: options.duration ?? (index < EARLY_COUNT_LIMIT ? COUNT_DURATION_EARLY_MS : COUNT_DURATION_LATE_MS),
        });
      }
      end = match.index + token.length;
    }
    fragment.append(document.createTextNode(original.slice(end)));
    target.replaceChildren(fragment);
  });

  for (const label of [...root.querySelectorAll('.metric-label, .property-figure figcaption'), ...(heading ? [heading] : [])]) {
    const fragment = document.createDocumentFragment();
    [...(label.textContent ?? '')].forEach((letter, index) => {
      if (/\s/.test(letter)) fragment.append(document.createTextNode(letter));
      else {
        const span = document.createElement('span');
        span.className = 'text-letter';
        span.style.setProperty('--letter-delay', Math.min(index * LETTER_STAGGER_MS, LETTER_STAGGER_CAP_MS) + 'ms');
        span.textContent = letter;
        fragment.append(span);
      }
    });
    label.replaceChildren(fragment);
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    for (const task of tasks) if (task.counter.isConnected) task.counter.replaceWith(document.createTextNode(task.token));
    media.removeEventListener('change', stop);
  }

  function tick(now: number) {
    let running = false;
    for (const task of tasks) {
      const progress = Math.max(0, Math.min(1, (now - task.start) / task.duration));
      if (progress < 1) {
        running = true;
        task.readout.dataset.value = formatCount(task.token, 1 - (1 - progress) ** 3);
      } else if (task.counter.isConnected) task.counter.replaceWith(document.createTextNode(task.token));
    }
    if (running) frame = requestAnimationFrame(tick);
    else stop();
  }

  media.addEventListener('change', stop);
  frame = requestAnimationFrame(tick);
  return stop;
}

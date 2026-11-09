/** Original roundToNice, SCALE_BAR_PX=60 and 0.5 m minimum. */
export function parkingScale(pixelsPerUnit: number, lastMeters: number, metersPerUnit: number) {
  const metersPerPx = metersPerUnit / pixelsPerUnit;
  const raw = 60 * metersPerPx;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const n = raw / magnitude;
  let meters = Math.max(0.5, (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * magnitude);
  if (lastMeters > 0 && raw >= lastMeters * 0.65 && raw <= lastMeters * 1.55) meters = lastMeters;
  return { meters, pixels: Math.round(meters / metersPerPx) };
}

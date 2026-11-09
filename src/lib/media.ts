import type { ImageMetadata } from "astro";
const images = import.meta.glob<{ default: ImageMetadata }>(
  "../assets/properties/**/*.{png,jpg,jpeg,webp,svg}",
  { eager: true },
);
export function mediaSource(src: string): ImageMetadata {
  const image = images[`../assets/${src}`];
  if (!image) throw new Error(`Missing media: ${src}`);
  return image.default;
}

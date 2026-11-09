import { z } from "zod";
// Avoid Zod's eval probe under the site's strict CSP.
z.config({ jitless: true });
export const utmKeys = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;
export const oneLine = (value: string) =>
  !/[\u0000-\u001F\u007F\u0085\u2028\u2029\u202A-\u202E\u2066-\u2069\uD800-\uDFFF]/u.test(
    value,
  );
const line = (min: number, max: number) =>
  z
    .string()
    .refine(oneLine)
    .transform((s) => s.replace(/^ +| +$/g, ""))
    .pipe(z.string().min(min).max(max));
export const consultSchema = z
  .object({
    name: line(2, 100),
    method: z.enum(["whatsapp", "phone", "telegram", "max"]),
    contact: line(3, 100),
    consent: z.literal(true),
    lotTitle: line(0, 80).optional(),
    lot: z
      .string()
      .max(64)
      .regex(/^(?:[a-z]+|[PK][1-9]\d*)$/)
      .optional(),
    page: z.string().min(1).max(500).startsWith("/").refine(oneLine),
    lang: z.enum(["ru", "en"]),
    company: z.string().max(200).refine(oneLine).optional(),
    utm: z
      .partialRecord(z.enum(utmKeys), z.string().max(200).refine(oneLine))
      .optional(),
  })
  .superRefine((data, ctx) => {
    const valid =
      data.method === "telegram"
        ? /^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(data.contact)
        : /^\+?[\d ().-]{7,30}$/.test(data.contact) &&
          data.contact.replace(/\D/g, "").length >= 7;
    if (!valid)
      ctx.addIssue({
        code: "custom",
        path: ["contact"],
        message: "invalid_contact",
      });
  });
export type ConsultPayload = z.infer<typeof consultSchema>;
export { consultMessage } from "./telegram-message";

import { z } from 'zod';

export const SubmissionKeySchema = z.uuid().brand<'SubmissionKey'>();
export type SubmissionKey = z.infer<typeof SubmissionKeySchema>;
export const LeadReferenceSchema = z.uuid().brand<'LeadReference'>();
export type LeadReference = z.infer<typeof LeadReferenceSchema>;

export const LeadSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(2, 'Skriv dit navn (2–100 tegn).')
    .max(100, 'Skriv dit navn (2–100 tegn).'),
  email: z
    .string()
    .trim()
    .max(254)
    .pipe(z.email('Skriv en gyldig e-mailadresse.')),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine(
      (value) =>
        !value || /^(?:\+45)?[0-9]{8}$/.test(value.replace(/[\s-]/g, '')),
      'Skriv et dansk telefonnummer med 8 cifre, eller lad feltet stå tomt.',
    ),
  postalCode: z
    .string()
    .trim()
    .regex(/^[0-9]{4}$/, 'Skriv et postnummer med 4 cifre.'),
  service: z.enum(['belysning', 'smart-home', 'forbedringer', 'andet'], {
    error: 'Vælg, hvad du gerne vil have hjælp til.',
  }),
  description: z
    .string()
    .trim()
    .min(10, 'Beskriv din opgave med 10–1.500 tegn.')
    .max(1500, 'Beskriv din opgave med 10–1.500 tegn.'),
  terms: z.literal(true, {
    error: 'Bekræft, at du har læst om pilotprojektet.',
  }),
});

/** Validated enquiry snapshot; repeated customers are intentionally not merged. */
export type LeadSubmission = z.infer<typeof LeadSchema>;
export type LeadInput = Record<
  Exclude<keyof LeadSubmission, 'terms'>,
  string
> & { terms: boolean };
export type LeadField = keyof LeadInput;
export type LeadErrors = Partial<Record<LeadField, string>>;

export const CreateLeadRequestSchema = z.strictObject({
  lead: LeadSchema,
  turnstileToken: z.string().max(2048),
});

export const LeadReceiptSchema = z.strictObject({
  reference: LeadReferenceSchema,
});
/** A receipt confirms durable storage, not task acceptance or notification delivery. */
export type LeadReceipt = z.infer<typeof LeadReceiptSchema>;

export function validateLead(input: LeadInput): LeadErrors {
  const result = LeadSchema.safeParse(input);
  if (result.success) return {};
  const errors: LeadErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as LeadField;
    if (field in LeadSchema.shape && !errors[field])
      errors[field] = issue.message;
  }
  return errors;
}

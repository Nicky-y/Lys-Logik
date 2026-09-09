import { z } from 'zod';
import {
  LeadSchema,
  LeadReferenceSchema,
  SubmissionKeySchema,
  type LeadInput,
} from '../../supabase/functions/_shared/contracts/lead.ts';

const ResponseSchema = z.strictObject({
  success: z.literal(true),
  reference: LeadReferenceSchema,
});

/** Keeps the retry key in memory only. A changed enquiry starts a new submission. */
export function createLeadSender(
  endpoint: string,
  fetcher: typeof fetch = fetch,
  newKey: () => string = () => crypto.randomUUID(),
) {
  let pending: { payload: string; key: string } | undefined;
  let sending = false;
  return async (input: LeadInput, turnstileToken: string) => {
    if (sending) throw new Error('Henvendelsen er ved at blive sendt.');
    const lead = LeadSchema.parse(input);
    const payload = JSON.stringify(lead);
    if (!pending || pending.payload !== payload) {
      pending = { payload, key: SubmissionKeySchema.parse(newKey()) };
    }
    sending = true;
    try {
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': pending.key,
        },
        body: JSON.stringify({ lead, turnstileToken }),
        signal: AbortSignal.timeout(15_000),
        credentials: 'omit',
      });
      if (!response.ok) {
        const message =
          response.status === 429
            ? 'Der er mange henvendelser lige nu. Prøv igen lidt senere.'
            : response.status === 422
              ? 'Sikkerhedskontrollen skal gennemføres igen. Prøv derefter at sende.'
              : response.status === 409
                ? 'Denne henvendelse er allerede registreret med andre oplysninger. Genindlæs siden for at starte en ny.'
                : 'Vi kunne ikke bekræfte modtagelsen. Dine oplysninger er bevaret i formularen. Prøv igen.';
        throw new Error(message);
      }
      const result = ResponseSchema.parse(await response.json());
      pending = undefined;
      return result;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.startsWith('Der er ') ||
          error.message.startsWith('Denne henvendelse') ||
          error.message.startsWith('Vi kunne') ||
          error.message.startsWith('Sikkerhedskontrollen'))
      )
        throw error;
      throw new Error(
        'Vi kunne ikke bekræfte modtagelsen. Dine oplysninger er bevaret i formularen. Prøv igen.',
      );
    } finally {
      sending = false;
    }
  };
}

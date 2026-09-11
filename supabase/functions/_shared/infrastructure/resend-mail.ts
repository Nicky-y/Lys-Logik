import { z } from 'zod';
import { convert } from 'html-to-text';
import {
  AttachmentSchema,
  ProviderMailIdSchema,
  type MailJob,
  type MailResult,
} from '../contracts/mail.ts';

export async function limitedBytes(
  response: Response | Request,
  limit: number,
): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length')) > limit)
    throw new Error('mail_too_large');
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('mail_too_large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
export function createResendMail(
  apiKey: string,
  request: typeof fetch = fetch,
) {
  async function api(path: string, init: RequestInit = {}) {
    return request('https://api.resend.com' + path, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
  }
  return {
    async send(job: MailJob): Promise<MailResult> {
      const response = await api('/emails', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'customer-message/' + job.id },
        body: JSON.stringify(job.payload),
      });
      if (response.ok) {
        const { id } = z
          .object({ id: ProviderMailIdSchema })
          .parse(
            JSON.parse(
              new TextDecoder().decode(await limitedBytes(response, 16384)),
            ),
          );
        return { state: 'accepted', providerId: id };
      }
      if ([408, 429].includes(response.status) || response.status >= 500)
        return { state: 'retry' };
      if (response.status === 409) {
        const body = JSON.parse(
          new TextDecoder().decode(await limitedBytes(response, 16384)),
        );
        return {
          state:
            body.name === 'concurrent_idempotent_requests' ? 'retry' : 'review',
        };
      }
      return { state: 'failed' };
    },
    async receive(id: z.infer<typeof ProviderMailIdSchema>) {
      const response = await api(
        '/emails/receiving/' +
          ProviderMailIdSchema.parse(id) +
          '?html_format=cid',
      );
      if (!response.ok) throw new Error('receiving_unavailable');
      const raw = z
        .object({
          id: ProviderMailIdSchema,
          from: z.string().max(500),
          to: z.array(z.string().max(500)).max(100),
          subject: z.string().nullable(),
          text: z.string().nullable(),
          html: z.string().nullable(),
          attachments: z.array(AttachmentSchema).max(30),
        })
        .parse(
          JSON.parse(
            new TextDecoder().decode(
              await limitedBytes(response, 2 * 1024 * 1024),
            ),
          ),
        );
      if (raw.id !== id) throw new Error('provider_identity_mismatch');
      const body =
        raw.text?.trim() ||
        convert(raw.html || '', {
          wordwrap: false,
          selectors: [{ selector: 'img', format: 'skip' }],
        });
      const address = (v: string) =>
        v.match(/<([^<>]+)>\s*$/)?.[1]?.trim() ?? v.trim();
      return {
        from: raw.from,
        senderEmail: address(raw.from).toLowerCase(),
        to: raw.to.map((v) => address(v).toLowerCase()),
        subject: raw.subject,
        body:
          body.slice(0, 49900) +
          (body.length > 49900
            ? '\n[Resten af den lange mail er bevaret hos mailudbyderen.]'
            : ''),
        attachments: raw.attachments,
      };
    },
    async attachment(
      providerId: z.infer<typeof ProviderMailIdSchema>,
      attachmentId: string,
    ) {
      const response = await api(
        '/emails/receiving/' +
          ProviderMailIdSchema.parse(providerId) +
          '/attachments/' +
          z.uuid().parse(attachmentId),
      );
      if (!response.ok) throw new Error('attachment_unavailable');
      return JSON.parse(
        new TextDecoder().decode(await limitedBytes(response, 16384)),
      ) as unknown;
    },
  };
}

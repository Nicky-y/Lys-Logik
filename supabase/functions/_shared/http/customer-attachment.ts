import { z } from 'zod';
import {
  AttachmentSchema,
  MessageIdSchema,
  AttachmentIdSchema,
  ProviderMailIdSchema,
  downloadableAttachment,
} from '../contracts/mail.ts';
import { limitedBytes } from '../infrastructure/resend-mail.ts';
type AttachmentRequest = {
  messageId: z.infer<typeof MessageIdSchema>;
  attachmentId: z.infer<typeof AttachmentIdSchema>;
};
export interface AttachmentAccess {
  /** Check active staff membership and the attachment's message before returning its provider identity. */
  authorize(bearer: string, input: AttachmentRequest): Promise<unknown>;
  metadata(
    providerId: z.infer<typeof ProviderMailIdSchema>,
    attachmentId: z.infer<typeof AttachmentIdSchema>,
  ): Promise<unknown>;
}
export function customerAttachmentHandler(
  allowed: string[],
  access: AttachmentAccess,
  download: typeof fetch = fetch,
) {
  return async (request: Request) => {
    const origin = request.headers.get('origin');
    const headers: Record<string, string> = {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Origin',
    };
    if (origin && !allowed.includes(origin))
      return new Response(null, { status: 403, headers });
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] =
      'authorization,apikey,content-type,x-client-info';
    headers['Access-Control-Allow-Methods'] = 'POST,OPTIONS';
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers });
    if (request.method !== 'POST')
      return new Response(null, { status: 405, headers });
    const bearer = request.headers.get('authorization');
    if (!bearer?.startsWith('Bearer '))
      return new Response(null, { status: 401, headers });
    let input: AttachmentRequest;
    try {
      input = z
        .object({
          messageId: MessageIdSchema,
          attachmentId: AttachmentIdSchema,
        })
        .strict()
        .parse(
          JSON.parse(
            new TextDecoder().decode(await limitedBytes(request, 2048)),
          ),
        );
    } catch {
      return new Response(null, { status: 400, headers });
    }
    try {
      const source = await access.authorize(bearer, input);
      if (!source) return new Response(null, { status: 403, headers });
      const metadata = AttachmentSchema.extend({ download_url: z.url() }).parse(
        await access.metadata(
          ProviderMailIdSchema.parse(source),
          input.attachmentId,
        ),
      );
      if (
        metadata.id !== input.attachmentId ||
        !downloadableAttachment(metadata)
      )
        return new Response(null, { status: 422, headers });
      const url = new URL(metadata.download_url);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        (url.port && url.port !== '443') ||
        (url.hostname !== 'cdn.resend.app' &&
          !['.resend.com', '.cloudfront.net'].some((s) =>
            url.hostname.endsWith(s),
          ))
      )
        throw new Error('invalid_download_host');
      const response = await download(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('download_failed');
      const bytes = await limitedBytes(response, 10 * 1024 * 1024);
      headers['Content-Type'] = 'application/octet-stream';
      headers['Content-Disposition'] =
        "attachment; filename*=UTF-8''" +
        encodeURIComponent(metadata.filename.replace(/[\r\n/\\]/g, '_'));
      return new Response(bytes as BodyInit, { headers });
    } catch {
      return new Response(null, { status: 503, headers });
    }
  };
}

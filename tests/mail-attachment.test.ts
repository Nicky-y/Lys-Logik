import assert from 'node:assert/strict';
import { test } from 'node:test';
import { customerAttachmentHandler } from '../supabase/functions/_shared/http/customer-attachment.ts';
const id = '1054ed20-67f4-4ff8-bd50-b423d7b11baf';
const origin = 'https://app.lysoglogik.dk';
const metadata = {
  id,
  filename: 'lampe.jpg',
  size: 4,
  content_type: 'image/jpeg',
  download_url: 'https://cdn.resend.app/file',
};
const request = (
  headers: Record<string, string> = {},
  body = JSON.stringify({ messageId: id, attachmentId: id }),
) =>
  new Request('https://example.com', {
    method: 'POST',
    headers: { origin, authorization: 'Bearer fixture', ...headers },
    body,
  });
test('attachment retrieval is staff scoped, downloaded on demand and never publicly cached', async () => {
  let called = 0;
  const handler = customerAttachmentHandler(
    [origin],
    {
      authorize: async (token, input) => {
        assert.equal(token, 'Bearer fixture');
        assert.equal(input.messageId, id);
        return id;
      },
      metadata: async () => metadata,
    },
    async (url, init) => {
      called++;
      assert.equal(String(url), metadata.download_url);
      assert.equal(init?.redirect, 'error');
      return new Response('file');
    },
  );
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(
    response.headers.get('content-type'),
    'application/octet-stream',
  );
  assert.match(response.headers.get('content-disposition')!, /^attachment;/);
  assert.equal(await response.text(), 'file');
  assert.equal(called, 1);
});
test('anonymous, revoked, malformed and cross-origin requests cannot reach provider metadata', async () => {
  let metadataCalls = 0;
  const handler = customerAttachmentHandler([origin], {
    authorize: async () => null,
    metadata: async () => {
      metadataCalls++;
      return metadata;
    },
  });
  assert.equal((await handler(request({ authorization: '' }))).status, 401);
  assert.equal(
    (await handler(request({ origin: 'https://evil.example' }))).status,
    403,
  );
  assert.equal((await handler(request({}, '{}'))).status, 400);
  assert.equal((await handler(request())).status, 403);
  assert.equal(metadataCalls, 0);
});
test('provider attachments cannot redirect downloads to arbitrary hosts or smuggle active document types', async () => {
  let downloads = 0;
  for (const change of [
    { download_url: 'https://evil.example/a' },
    { download_url: 'https://cdn.resend.app.evil.example/a' },
    { download_url: 'https://evil.resend.app/a' },
    { download_url: 'https://cdn.resend.app:8443/a' },
    { download_url: 'http://attachments.resend.com/a' },
    { download_url: 'https://user:pass@attachments.resend.com/a' },
    { content_type: 'text/html' },
    { id: 'ec421bef-f031-4416-9f30-21871b4c7d30' },
    { size: 11 * 1024 * 1024 },
  ]) {
    const handler = customerAttachmentHandler(
      [origin],
      {
        authorize: async () => id,
        metadata: async () => ({ ...metadata, ...change }),
      },
      async () => {
        downloads++;
        return new Response('file');
      },
    );
    assert.ok([422, 503].includes((await handler(request())).status));
  }
  assert.equal(downloads, 0);
});
test('download byte limit does not trust a false attachment size', async () => {
  const handler = customerAttachmentHandler(
    [origin],
    { authorize: async () => id, metadata: async () => metadata },
    async () => new Response(new Uint8Array(10 * 1024 * 1024 + 1)),
  );
  assert.equal((await handler(request())).status, 503);
});

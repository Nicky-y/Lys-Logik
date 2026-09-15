/** Reads a bounded HTTP body even when Content-Length is absent or misleading. */
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

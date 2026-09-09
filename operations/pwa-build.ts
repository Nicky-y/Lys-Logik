import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

/** Version the public offline fallback on each build without caching customer data. */
export function pwaBuild(): Plugin {
  return {
    name: 'lys-logik-pwa',
    apply: 'build',
    generateBundle(_options, bundle) {
      const source = readFileSync(
        new URL('./service-worker.js', import.meta.url),
        'utf8',
      );
      const offline = readFileSync(
        new URL('./public/offline.html', import.meta.url),
      );
      const version = createHash('sha256')
        .update(source)
        .update(offline)
        .update(Object.keys(bundle).sort().join('\n'))
        .digest('hex')
        .slice(0, 16);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: source.replace('__BUILD_ID__', version),
      });
    },
  };
}

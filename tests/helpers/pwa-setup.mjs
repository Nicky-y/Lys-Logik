import {
  operationsServerReady,
  stopOperationsServer,
} from './operations-server.ts';

export default async function setup() {
  await operationsServerReady;
  let pwa;
  try {
    pwa = await import('./pwa-server.mjs');
    await pwa.pwaServerReady;
  } catch (error) {
    await stopOperationsServer();
    throw error;
  }
  return async () => {
    await pwa.stopPwaServer();
    await stopOperationsServer();
  };
}

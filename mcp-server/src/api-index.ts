import type { IncomingMessage, ServerResponse } from 'http';
import { handleVercelRequest, applyCorsHeaders } from './server.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (applyCorsHeaders(req, res)) {
    return;
  }
  return handleVercelRequest(req, res);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = handler;
  (module.exports as any).default = handler;
}

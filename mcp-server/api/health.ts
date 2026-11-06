import type { IncomingMessage, ServerResponse } from 'http';
import { handleHealthRequest, applyCorsHeaders } from '../src/server.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (applyCorsHeaders(req, res)) {
    return;
  }
  return handleHealthRequest(req, res);
}

import type { IncomingMessage, ServerResponse } from 'http';
import { handleVercelRequest } from '../src/server.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return handleVercelRequest(req, res);
}

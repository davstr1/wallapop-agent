import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { WallapopClient } from './client.js';
import { buildChatInstructions } from './browser.js';
import type { SearchParams } from './types.js';

const PORT = parseInt(process.env.PORT || '4100', 10);

/** Safely extract a string from express query param */
function qs(val: unknown): string | undefined {
  if (typeof val === 'string') return val;
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0];
  return undefined;
}

function qn(val: unknown): number | undefined {
  const s = qs(val);
  return s != null ? Number(s) : undefined;
}
const app = express();
const client = new WallapopClient();

app.use(cors());
app.use(express.json());

// ── Health ──────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'wallapop-agent' });
});

// ── Search ──────────────────────────────────────────────

app.get('/api/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params: SearchParams = {
      keywords: qs(req.query.q) || qs(req.query.keywords),
      minPrice: qn(req.query.minPrice),
      maxPrice: qn(req.query.maxPrice),
      distance: qn(req.query.distance),
      latitude: qn(req.query.lat),
      longitude: qn(req.query.lng),
      categoryId: qn(req.query.category),
      orderBy: qs(req.query.orderBy) as SearchParams['orderBy'],
      limit: qn(req.query.limit),
      nextPage: qs(req.query.nextPage),
    };

    const result = await client.search(params);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── Item Details ────────────────────────────────────────

app.get('/api/items/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await client.getItem(String(req.params.id)));
  } catch (err) {
    next(err);
  }
});

// ── Item Hash (for chat) ────────────────────────────────

app.get('/api/items/hash', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const target = qs(req.query.url) || qs(req.query.slug);
    if (!target) {
      res.status(400).json({ error: 'url or slug query param required' });
      return;
    }
    const hash = await client.getItemHash(target);
    res.json({ hash, chatUrl: client.chatUrl(hash) });
  } catch (err) {
    next(err);
  }
});

// ── User ────────────────────────────────────────────────

app.get('/api/users/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await client.getUser(String(req.params.id)));
  } catch (err) {
    next(err);
  }
});

app.get('/api/users/:id/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await client.getUserStats(String(req.params.id)));
  } catch (err) {
    next(err);
  }
});

app.get('/api/users/:id/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await client.getUserItems(String(req.params.id), {
      limit: qn(req.query.limit),
      nextPage: qs(req.query.nextPage),
    }));
  } catch (err) {
    next(err);
  }
});

// ── Categories ──────────────────────────────────────────

app.get('/api/categories', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await client.getCategories());
  } catch (err) {
    next(err);
  }
});

// ── Chat Instructions ───────────────────────────────────

app.post('/api/chat', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itemUrl, itemHash: providedHash, message } = req.body as {
      itemUrl?: string;
      itemHash?: string;
      message?: string;
    };

    if (!message) { res.status(400).json({ error: 'message required' }); return; }
    if (!itemUrl && !providedHash) { res.status(400).json({ error: 'itemUrl or itemHash required' }); return; }

    const hash = providedHash || await client.getItemHash(itemUrl!);
    const instructions = buildChatInstructions(hash, message);
    res.json(instructions);
  } catch (err) {
    next(err);
  }
});

// ── Composite: Search + Contact ─────────────────────────

app.post('/api/search-and-contact', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { query, message, maxPrice, minPrice, limit = 5, distance, lat, lng } = req.body as {
      query?: string;
      message?: string;
      maxPrice?: number;
      minPrice?: number;
      limit?: number;
      distance?: number;
      lat?: number;
      lng?: number;
    };

    if (!query) { res.status(400).json({ error: 'query required' }); return; }
    if (!message) { res.status(400).json({ error: 'message required' }); return; }

    const results = await client.search({
      keywords: query,
      maxPrice,
      minPrice,
      limit: Math.min(limit, 20),
      distance,
      latitude: lat,
      longitude: lng,
    });

    const available = results.items.filter(i => !i.reserved);
    const items = available.map(item => ({
      ...item,
      chatFlow: {
        step1: `GET /api/items/hash?slug=${item.slug}`,
        step2: `POST /api/chat { itemHash: "<hash>", message: "${message}" }`,
      },
    }));

    res.json({ items, total: items.length, nextPage: results.nextPage });
  } catch (err) {
    next(err);
  }
});

// ── Error handler ───────────────────────────────────────

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || 500;
  console.error(`[${status}] ${err.message}`);
  res.status(status).json({ error: err.message });
});

// ── Start ───────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🛒 Wallapop Agent API on http://localhost:${PORT}`);
  console.log(`   Proxy: ${process.env.PROXY_URL ? '✅' : '❌ not set'}`);
});

import express from 'express';
import cors from 'cors';
import { WallapopClient } from './client.js';
import { buildChatInstructions, buildHashExtractInstruction } from './browser.js';

const PORT = parseInt(process.env.PORT || '4100', 10);
const app = express();
const client = new WallapopClient();

app.use(cors());
app.use(express.json());

// ── Health ──────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'wallapop-agent' });
});

// ── Search ──────────────────────────────────────────────
// GET /api/search?q=mesa&maxPrice=50&limit=10

app.get('/api/search', async (req, res, next) => {
  try {
    const { q, keywords, minPrice, maxPrice, distance, lat, lng, category, orderBy, limit, nextPage } = req.query;
    const result = await client.search({
      keywords: q || keywords,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      distance: distance ? Number(distance) : undefined,
      latitude: lat ? Number(lat) : undefined,
      longitude: lng ? Number(lng) : undefined,
      categoryId: category ? Number(category) : undefined,
      orderBy,
      limit: limit ? Number(limit) : undefined,
      nextPage,
    });
    res.json(result);
  } catch (err) { next(err); }
});

// ── Item Details ────────────────────────────────────────
// GET /api/items/:id

app.get('/api/items/:id', async (req, res, next) => {
  try {
    const item = await client.getItem(req.params.id);
    res.json(item);
  } catch (err) { next(err); }
});

// ── Item Hash (for chat) ────────────────────────────────
// GET /api/items/hash?url=https://es.wallapop.com/item/...
// POST /api/items/hash { slug: "mesa-redonda-blanca-1232652380" }

app.get('/api/items/hash', async (req, res, next) => {
  try {
    const { url, slug } = req.query;
    const target = url || slug;
    if (!target) return res.status(400).json({ error: 'url or slug required' });
    const hash = await client.getItemHash(target);
    res.json({ hash, chatUrl: client.chatUrl(hash) });
  } catch (err) { next(err); }
});

// ── User ────────────────────────────────────────────────
// GET /api/users/:id
// GET /api/users/:id/stats
// GET /api/users/:id/items

app.get('/api/users/:id', async (req, res, next) => {
  try { res.json(await client.getUser(req.params.id)); } catch (err) { next(err); }
});

app.get('/api/users/:id/stats', async (req, res, next) => {
  try { res.json(await client.getUserStats(req.params.id)); } catch (err) { next(err); }
});

app.get('/api/users/:id/items', async (req, res, next) => {
  try {
    const { limit, nextPage } = req.query;
    res.json(await client.getUserItems(req.params.id, {
      limit: limit ? Number(limit) : undefined,
      nextPage,
    }));
  } catch (err) { next(err); }
});

// ── Categories ──────────────────────────────────────────

app.get('/api/categories', async (_req, res, next) => {
  try { res.json(await client.getCategories()); } catch (err) { next(err); }
});

// ── Chat Instructions (for browser agent) ───────────────
// POST /api/chat { itemUrl: "...", message: "Hola! ..." }
// Returns the browser steps needed to send a message

app.post('/api/chat', async (req, res, next) => {
  try {
    const { itemUrl, itemHash: providedHash, message } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });
    if (!itemUrl && !providedHash) return res.status(400).json({ error: 'itemUrl or itemHash required' });

    let hash = providedHash;
    if (!hash) {
      hash = await client.getItemHash(itemUrl);
    }

    const instructions = buildChatInstructions({ itemHash: hash, message });
    res.json({
      hash,
      chatUrl: instructions.chatUrl,
      message,
      instructions: instructions.steps,
    });
  } catch (err) { next(err); }
});

// ── Composite: Search + Contact ─────────────────────────
// POST /api/search-and-contact
// { query: "mesa", message: "Hola!", maxPrice: 50, limit: 5 }
// Returns search results + chat instructions for each item

app.post('/api/search-and-contact', async (req, res, next) => {
  try {
    const { query, message, maxPrice, minPrice, limit = 5, distance, lat, lng } = req.body;
    if (!query) return res.status(400).json({ error: 'query required' });
    if (!message) return res.status(400).json({ error: 'message required' });

    const results = await client.search({
      keywords: query,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      minPrice: minPrice ? Number(minPrice) : undefined,
      limit: Math.min(Number(limit), 20),
      distance: distance ? Number(distance) : undefined,
      latitude: lat ? Number(lat) : undefined,
      longitude: lng ? Number(lng) : undefined,
    });

    // Filter out reserved items
    const available = results.items.filter(i => !i.reserved);

    // For each item, build chat instructions
    // Note: getting hashes requires scraping each page — can be slow
    // The agent can do this one at a time as needed
    const items = available.map(item => ({
      ...item,
      chatInstructions: {
        step1_getHash: `GET /api/items/hash?slug=${item.slug}`,
        step2_chat: `POST /api/chat { itemHash: "<hash>", message: "${message}" }`,
      },
    }));

    res.json({ items, total: items.length, nextPage: results.nextPage });
  } catch (err) { next(err); }
});

// ── Error handler ───────────────────────────────────────

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  console.error(`[${status}] ${err.message}`);
  res.status(status).json({ error: err.message });
});

// ── Start ───────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🛒 Wallapop Agent API on http://localhost:${PORT}`);
  console.log(`   Proxy: ${process.env.PROXY_URL ? '✅' : '❌ not set (API calls may fail)'}`);
  console.log(`   Endpoints:`);
  console.log(`     GET  /api/search?q=mesa&maxPrice=50`);
  console.log(`     GET  /api/items/:id`);
  console.log(`     GET  /api/items/hash?url=...`);
  console.log(`     GET  /api/users/:id`);
  console.log(`     POST /api/chat { itemUrl, message }`);
  console.log(`     POST /api/search-and-contact { query, message }`);
});

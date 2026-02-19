# Wallapop Agent API

API for AI agents to search Wallapop, browse items, and contact sellers.

**Philosophy:** API for data (search, items, users), browser only for messaging.

## Quick Start

```bash
# Optional: set proxy for API calls (Wallapop blocks direct server requests)
export PROXY_URL=http://your-proxy:port

npm start
# → http://localhost:4100
```

## Endpoints

### Search
```
GET /api/search?q=mesa&maxPrice=50&limit=10
```
Returns simplified items: id, title, price, city, url, seller, shippable.

### Item Details
```
GET /api/items/:id
```

### Item Hash (for chat URLs)
```
GET /api/items/hash?url=https://es.wallapop.com/item/mesa-redonda-1232652380
```
Returns `{ hash, chatUrl }` — the hash is needed to open chat.

### Chat Instructions
```
POST /api/chat
{ "itemUrl": "https://es.wallapop.com/item/...", "message": "Hola!" }
```
Returns browser automation steps for the agent to execute.

### Search + Contact (composite)
```
POST /api/search-and-contact
{ "query": "mesa", "message": "Hola! Aún lo tienes?", "maxPrice": 50, "limit": 5 }
```
Returns items with chat instructions for each.

### Users
```
GET /api/users/:id
GET /api/users/:id/stats
GET /api/users/:id/items
```

### Categories
```
GET /api/categories
```

## Agent Flow

1. **Search** → `GET /api/search?q=lampara`
2. **Pick item** → agent selects from results
3. **Get hash** → `GET /api/items/hash?slug={item.slug}`
4. **Get chat steps** → `POST /api/chat { itemHash, message }`
5. **Execute in browser** → agent uses browser tool to navigate to chatUrl, type message, send

Steps 1-4 are pure API (fast, low tokens). Step 5 is the only browser interaction.

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Agent      │────▶│  Wallapop Agent  │────▶│  Wallapop API   │
│  (OpenClaw)  │     │   API (:4100)    │     │  (api.wallapop) │
└──────┬───────┘     └──────────────────┘     └─────────────────┘
       │                                              │
       │  browser tool (chat only)                    │ proxy
       ▼                                              ▼
┌─────────────┐                              ┌─────────────────┐
│   Chrome     │                              │   Proxy Server  │
│  (Relay)     │                              │   (optional)    │
└─────────────┘                              └─────────────────┘
```

## Key Discovery: Item Hash

Wallapop uses two ID systems:
- **Numeric ID** (in URLs): `1232652380`
- **Internal hash** (for chat): `qzmmv570nlzv`

The hash is in the page's `__NEXT_DATA__` JSON. The `/api/items/hash` endpoint scrapes it.

## Port: 4100

/**
 * Wallapop API Client
 * Public endpoints — no auth needed, proxy required for server-side.
 */

const WALLAPOP_API = 'https://api.wallapop.com/api/v3';
const WALLAPOP_BFF = 'https://api.wallapop.com/bff';

const REQUIRED_HEADERS = {
  Host: 'api.wallapop.com',
  'X-DeviceOS': '0',
};

// Barcelona defaults
const DEFAULT_LAT = 41.3891;
const DEFAULT_LNG = 2.1606;

export class WallapopClient {
  #proxyUrl;
  #fetchFn;

  constructor({ proxyUrl } = {}) {
    this.#proxyUrl = proxyUrl || process.env.PROXY_URL || '';
    this.#fetchFn = this.#proxyUrl ? this.#proxiedFetch.bind(this) : fetch;
  }

  async #proxiedFetch(url, opts = {}) {
    const { HttpsProxyAgent } = await import('https-proxy-agent');
    const agent = new HttpsProxyAgent(this.#proxyUrl);
    // node-fetch compatible via undici dispatcher or https-proxy-agent
    return fetch(url, { ...opts, dispatcher: undefined, agent });
  }

  async #get(path, params = {}) {
    const url = new URL(path, WALLAPOP_API);
    for (const [k, v] of Object.entries(params)) {
      if (v != null) url.searchParams.set(k, String(v));
    }
    const res = await this.#fetchFn(url.toString(), {
      headers: REQUIRED_HEADERS,
    });
    if (!res.ok) throw new Error(`Wallapop API ${res.status}: ${await res.text()}`);
    return res.json();
  }

  // ── Search ──────────────────────────────────────────

  async search({
    keywords,
    minPrice,
    maxPrice,
    distance,
    latitude = DEFAULT_LAT,
    longitude = DEFAULT_LNG,
    categoryId,
    orderBy,
    limit = 20,
    nextPage,
  } = {}) {
    const params = { step: 1, source: 'keywords', limit };
    if (nextPage) {
      params.next_page = nextPage;
    } else {
      if (keywords) params.keywords = keywords;
      if (minPrice != null) params.min_sale_price = minPrice;
      if (maxPrice != null) params.max_sale_price = maxPrice;
      if (distance != null) params.distance = distance;
      if (latitude != null) params.latitude = latitude;
      if (longitude != null) params.longitude = longitude;
      if (categoryId != null) params.category_id = categoryId;
      if (orderBy) params.order_by = orderBy;
    }

    const data = await this.#get('/search', params);
    const items = data?.data?.section?.payload?.items || [];
    return {
      items: items.map(simplifySearchItem),
      nextPage: data?.meta?.next_page || null,
      total: items.length,
    };
  }

  // ── Item Details ────────────────────────────────────

  async getItem(itemId) {
    const raw = await this.#get(`/items/${itemId}`);
    return simplifyItemDetails(raw);
  }

  // ── User ────────────────────────────────────────────

  async getUser(userId) {
    return this.#get(`/users/${userId}`);
  }

  async getUserStats(userId) {
    return this.#get(`/users/${userId}/stats`);
  }

  async getUserItems(userId, { limit = 20, nextPage } = {}) {
    return this.#get(`/users/${userId}/items`, { limit, next_page: nextPage });
  }

  // ── Categories ──────────────────────────────────────

  async getCategories() {
    return this.#get('/categories');
  }

  // ── Item Hash from URL ──────────────────────────────
  // Scrapes the web page to get the internal hash needed for chat

  async getItemHash(urlOrSlug) {
    let fullUrl;
    if (urlOrSlug.startsWith('http')) {
      fullUrl = urlOrSlug;
    } else {
      fullUrl = `https://es.wallapop.com/item/${urlOrSlug}`;
    }

    const res = await fetch(fullUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    });
    const html = await res.text();

    const match = html.match(
      /<script\s+id="__NEXT_DATA__"\s+type="application\/json">([^<]+)<\/script>/
    );
    if (!match?.[1]) throw new Error('Could not find __NEXT_DATA__ in page');

    const nextData = JSON.parse(match[1]);
    const hash = nextData?.props?.pageProps?.item?.id;
    if (!hash) throw new Error('Could not extract item hash from page');
    return hash;
  }

  // ── Chat URL builder ────────────────────────────────

  chatUrl(itemHash) {
    return `https://es.wallapop.com/app/chat?itemId=${itemHash}`;
  }
}

// ── Simplifiers (reduce token count for agents) ────────

function simplifySearchItem(item) {
  return {
    id: item.id,
    title: item.title,
    price: item.price?.amount,
    currency: item.price?.currency || 'EUR',
    city: item.location?.city,
    distance: item.distance,
    slug: item.web_slug,
    url: `https://es.wallapop.com/item/${item.web_slug}`,
    image: item.images?.[0]?.urls?.medium,
    sellerId: item.user_id,
    reserved: item.reserved?.flag || false,
    shippable: item.shipping?.user_allows_shipping || false,
    createdAt: item.created_at,
  };
}

function simplifyItemDetails(raw) {
  const title = typeof raw.title === 'object' ? raw.title.original : raw.title;
  const desc = typeof raw.description === 'object' ? raw.description.original : raw.description;
  const price = raw.price?.cash?.amount ?? raw.price?.amount;

  return {
    id: raw.id,
    title,
    description: desc,
    price,
    currency: raw.price?.cash?.currency || raw.price?.currency || 'EUR',
    city: raw.location?.city,
    seller: {
      id: raw.user?.id,
      name: raw.user?.micro_name,
    },
    slug: raw.web_slug,
    url: `https://es.wallapop.com/item/${raw.web_slug}`,
    images: (raw.images || []).length,
    reserved: raw.reserved?.flag || false,
    sold: raw.sold?.flag || false,
    counters: raw.counters || null,
    createdAt: raw.creation_date,
  };
}

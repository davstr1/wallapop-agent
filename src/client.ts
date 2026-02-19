import { HttpsProxyAgent } from 'https-proxy-agent';
import type {
  ClientConfig,
  SearchParams,
  SearchResult,
  SearchItem,
  RawSearchResponse,
  RawSearchItem,
  RawItemDetails,
  ItemDetails,
  InboxResponse,
} from './types.js';

const WALLAPOP_API = 'https://api.wallapop.com/api/v3';
const REQUIRED_HEADERS: Record<string, string> = {
  Host: 'api.wallapop.com',
  'X-DeviceOS': '0',
};

// Barcelona defaults
const DEFAULT_LAT = 41.3891;
const DEFAULT_LNG = 2.1606;

export class WallapopClient {
  private proxyUrl: string;
  private agent: HttpsProxyAgent<string> | undefined;

  constructor(config: ClientConfig = {}) {
    this.proxyUrl = config.proxyUrl || process.env.PROXY_URL || '';
    if (this.proxyUrl) {
      this.agent = new HttpsProxyAgent(this.proxyUrl);
    }
  }

  private async get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(`${WALLAPOP_API}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v != null) url.searchParams.set(k, String(v));
    }

    const fetchOpts: RequestInit & { agent?: HttpsProxyAgent<string> } = {
      headers: REQUIRED_HEADERS,
    };
    // node fetch supports agent via undici
    if (this.agent) {
      (fetchOpts as any).agent = this.agent;
    }

    const res = await fetch(url.toString(), fetchOpts);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Wallapop API ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  // ── Search ──────────────────────────────────────────

  async search(params: SearchParams = {}): Promise<SearchResult> {
    const query: Record<string, string | number> = { step: 1, source: 'keywords', limit: params.limit ?? 20 };

    if (params.nextPage) {
      query.next_page = params.nextPage;
    } else {
      if (params.keywords) query.keywords = params.keywords;
      if (params.minPrice != null) query.min_sale_price = params.minPrice;
      if (params.maxPrice != null) query.max_sale_price = params.maxPrice;
      if (params.distance != null) query.distance = params.distance;
      query.latitude = params.latitude ?? DEFAULT_LAT;
      query.longitude = params.longitude ?? DEFAULT_LNG;
      if (params.categoryId != null) query.category_id = params.categoryId;
      if (params.orderBy) query.order_by = params.orderBy;
    }

    const data = await this.get<RawSearchResponse>('/search', query);
    const items = data?.data?.section?.payload?.items || [];

    return {
      items: items.map(simplifySearchItem),
      nextPage: data?.meta?.next_page || null,
      total: items.length,
    };
  }

  // ── Item Details ────────────────────────────────────

  async getItem(itemId: string): Promise<ItemDetails> {
    const raw = await this.get<RawItemDetails>(`/items/${itemId}`);
    return simplifyItemDetails(raw);
  }

  // ── User ────────────────────────────────────────────

  async getUser(userId: string): Promise<unknown> {
    return this.get(`/users/${userId}`);
  }

  async getUserStats(userId: string): Promise<unknown> {
    return this.get(`/users/${userId}/stats`);
  }

  async getUserItems(userId: string, opts: { limit?: number; nextPage?: string } = {}): Promise<unknown> {
    const params: Record<string, string | number> = {};
    if (opts.limit) params.limit = opts.limit;
    if (opts.nextPage) params.next_page = opts.nextPage;
    return this.get(`/users/${userId}/items`, params);
  }

  // ── Categories ──────────────────────────────────────

  async getCategories(): Promise<unknown> {
    return this.get('/categories');
  }

  // ── Item Hash from URL ──────────────────────────────

  async getItemHash(urlOrSlug: string): Promise<string> {
    let fullUrl: string;
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
    const hash: string | undefined = nextData?.props?.pageProps?.item?.id;
    if (!hash) throw new Error('Could not extract item hash from page data');
    return hash;
  }

  // ── Inbox (auth required) ────────────────────────────

  async getInbox(bearerToken: string, opts: { pageSize?: number; maxMessages?: number } = {}): Promise<InboxResponse> {
    const url = new URL('https://api.wallapop.com/bff/messaging/inbox');
    url.searchParams.set('page_size', String(opts.pageSize ?? 100));
    url.searchParams.set('max_messages', String(opts.maxMessages ?? 1));

    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json, text/plain, */*',
        Authorization: `Bearer ${bearerToken}`,
        Referer: 'https://es.wallapop.com/',
        'Accept-Language': 'es,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
    if (!res.ok) throw new Error(`Inbox ${res.status}: ${await res.text()}`);
    return res.json() as Promise<InboxResponse>;
  }

  // ── Conversation messages (auth required) ───────────

  async getConversation(bearerToken: string, conversationId: string): Promise<unknown> {
    const url = `https://api.wallapop.com/bff/messaging/conversations/${conversationId}/messages`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        Authorization: `Bearer ${bearerToken}`,
        Referer: 'https://es.wallapop.com/',
      },
    });
    if (!res.ok) throw new Error(`Conversation ${res.status}: ${await res.text()}`);
    return res.json();
  }

  // ── Token extraction (browser cookie) ────────────────

  /**
   * JavaScript to evaluate in browser to extract the Bearer token.
   * Run this on any authenticated Wallapop page.
   * Returns the token string or null.
   */
  static TOKEN_EXTRACT_JS = `
    (() => {
      const match = document.cookie.split(';')
        .map(c => c.trim())
        .find(c => c.startsWith('accessToken='));
      return match ? match.slice('accessToken='.length) : null;
    })()
  `.trim();

  // ── Helpers ─────────────────────────────────────────

  chatUrl(itemHash: string): string {
    return `https://es.wallapop.com/app/chat?itemId=${itemHash}`;
  }
}

// ── Simplifiers ─────────────────────────────────────────

function simplifySearchItem(item: RawSearchItem): SearchItem {
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

function simplifyItemDetails(raw: RawItemDetails): ItemDetails {
  const title = typeof raw.title === 'object' ? raw.title.original : raw.title;
  const desc = typeof raw.description === 'object' ? raw.description.original : raw.description;
  const price = raw.price?.cash?.amount ?? raw.price?.amount ?? 0;

  return {
    id: raw.id,
    title,
    description: desc,
    price,
    currency: raw.price?.cash?.currency || raw.price?.currency || 'EUR',
    city: raw.location?.city,
    seller: { id: raw.user?.id, name: raw.user?.micro_name },
    slug: raw.web_slug,
    url: `https://es.wallapop.com/item/${raw.web_slug}`,
    images: (raw.images || []).length,
    reserved: raw.reserved?.flag || false,
    sold: raw.sold?.flag || false,
    counters: raw.counters || null,
    createdAt: raw.creation_date,
  };
}

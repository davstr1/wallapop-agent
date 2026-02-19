// ── Search ──────────────────────────────────────────────

export interface SearchParams {
  keywords?: string;
  minPrice?: number;
  maxPrice?: number;
  distance?: number;
  latitude?: number;
  longitude?: number;
  categoryId?: number;
  orderBy?: 'newest' | 'price_low_to_high' | 'price_high_to_low' | 'distance';
  limit?: number;
  nextPage?: string;
}

/** Raw Wallapop API search item */
export interface RawSearchItem {
  id: string;
  title: string;
  description: string;
  price: { amount: number; currency: string };
  location: {
    city: string;
    latitude: number;
    longitude: number;
    postal_code?: string;
  };
  images: Array<{ urls: { small: string; medium: string; big: string } }>;
  shipping?: { item_is_shippable: boolean; user_allows_shipping: boolean };
  user_id: string;
  reserved?: { flag: boolean };
  bump?: { type: string };
  favorited?: { flag: boolean };
  created_at: number;
  modified_at: number;
  web_slug: string;
  distance?: number;
}

/** Raw Wallapop API search response */
export interface RawSearchResponse {
  data: {
    section: {
      payload: {
        items: RawSearchItem[];
      };
    };
  };
  meta: {
    next_page?: string;
  };
}

/** Simplified search item (agent-friendly, low tokens) */
export interface SearchItem {
  id: string;
  title: string;
  price: number;
  currency: string;
  city: string;
  distance?: number;
  slug: string;
  url: string;
  image?: string;
  sellerId: string;
  reserved: boolean;
  shippable: boolean;
  createdAt: number;
}

export interface SearchResult {
  items: SearchItem[];
  nextPage: string | null;
  total: number;
}

// ── Item Details ────────────────────────────────────────

export interface RawItemDetails {
  id: string;
  title: { original: string } | string;
  description: { original: string } | string;
  price: {
    cash?: { amount: number; currency: string };
    amount?: number;
    currency?: string;
  };
  location: { city: string; latitude: number; longitude: number; zip?: string };
  user: { id: string; micro_name: string };
  images: unknown[];
  shipping?: { item_is_shippable: boolean; user_allows_shipping: boolean };
  creation_date: number;
  modification_date: number;
  web_slug: string;
  reserved?: { flag: boolean };
  sold?: { flag: boolean };
  visibility_flags?: { bumped: boolean; highlighted: boolean };
  counters?: { views: number; favorites: number; conversations: number };
}

export interface ItemDetails {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  city: string;
  seller: { id: string; name: string };
  slug: string;
  url: string;
  images: number;
  reserved: boolean;
  sold: boolean;
  counters: { views: number; favorites: number; conversations: number } | null;
  createdAt: number;
}

// ── Chat ────────────────────────────────────────────────

export interface ChatStep {
  action: string;
  url?: string;
  selector?: string;
  text?: string;
  submit?: boolean;
  note: string;
}

export interface ChatInstructions {
  hash: string;
  chatUrl: string;
  message: string;
  steps: ChatStep[];
}

// ── Config ──────────────────────────────────────────────

export interface ClientConfig {
  proxyUrl?: string;
}

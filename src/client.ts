import { GifutoError } from './errors';
import { request, type HttpOptions } from './http';
import type { Collection, CollectionInput, CollectionWithGifs, FavoriteGif, FavoriteResult, Gif, Me, PageOptions, PageMeta, NameCount, Page, RandomOptions, SearchOptions, SuggestInput, SuggestResult, Tag } from './types';

export const DEFAULT_BASE_URL = 'https://gifuto.vercel.app/api/v1';
const MAX_EXCLUDE_IDS = 50;

export interface GifutoOptions {
  /** Your API key (`sgif_…`), generated from your Gifuto profile. */
  apiKey: string;
  /** Override for self-hosting or tests. */
  baseUrl?: string;
  /** Per-request timeout, default 8000 ms. */
  timeoutMs?: number;
  /** Retries on 429 / 5xx / network errors for GET requests, default 2 (0 disables). */
  maxRetries?: number;
  /** Longest wait accepted before a retry, default 5000 ms. */
  maxRetryWaitMs?: number;
  /** How many GIF ids `noRepeat` remembers per name, default 30 (max 50). */
  noRepeatSize?: number;
  /** Custom fetch (tests, proxies). Defaults to the global fetch (Node 18+). */
  fetch?: typeof fetch;
}

export class Gifuto {
  private readonly http: HttpOptions;
  private readonly recent = new Map<string, string[]>();
  private readonly noRepeatSize: number;

  constructor(options: GifutoOptions) {
    if (!options || typeof options.apiKey !== 'string' || !options.apiKey.trim()) {
      throw new GifutoError('An API key is required: new Gifuto({ apiKey }).', { code: 'missing_api_key' });
    }
    const f = options.fetch ?? globalThis.fetch;
    if (!f) throw new GifutoError('No fetch implementation found. Use Node 18+ or pass `fetch`.', { code: 'no_fetch' });
    this.http = {
      apiKey: options.apiKey.trim(),
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      timeoutMs: options.timeoutMs ?? 8000,
      maxRetries: options.maxRetries ?? 2,
      maxRetryWaitMs: options.maxRetryWaitMs ?? 5000,
      fetch: f.bind(globalThis),
    };
    this.noRepeatSize = Math.min(Math.max(options.noRepeatSize ?? 30, 1), MAX_EXCLUDE_IDS);
  }

  /** A random GIF. Throws `NotFoundError` (`no_gif_found`) when nothing matches. */
  async getRandomGif(options: RandomOptions = {}): Promise<Gif> {
    const { noRepeat, ...rest } = options;
    const memory = noRepeat ? this.recent.get(noRepeat) ?? [] : [];
    const excludeIds = [...new Set([...(rest.excludeIds ?? []), ...memory])].slice(-MAX_EXCLUDE_IDS);

    const call = (ids: string[]) =>
      request<{ data: Gif }>(this.http, 'GET', '/gifs/random', {
        query: { tag: rest.tag, excludeTags: rest.excludeTags, excludeIds: ids, excludeAnime: rest.excludeAnime },
      });

    let res: { data: Gif };
    try {
      res = await call(excludeIds);
    } catch (e) {
      // Everything matching was already sent: forget the memory and start over.
      if (e instanceof GifutoError && e.code === 'no_gif_found' && memory.length) {
        this.recent.delete(noRepeat!);
        res = await call(rest.excludeIds ?? []);
      } else throw e;
    }

    if (noRepeat) this.recent.set(noRepeat, [...memory, res.data.id].slice(-this.noRepeatSize));
    return res.data;
  }

  /** One page of results. */
  async searchGifs(options: SearchOptions = {}): Promise<Page<Gif>> {
    return request<Page<Gif>>(this.http, 'GET', '/gifs/search', { query: { ...options } });
  }

  async getGifById(id: string): Promise<Gif> {
    return (await request<{ data: Gif }>(this.http, 'GET', `/gifs/${encodeURIComponent(id)}`)).data;
  }

  /** All tags with their number of approved GIFs. */
  async getTags(): Promise<Tag[]> {
    return (await request<{ data: Tag[] }>(this.http, 'GET', '/tags')).data;
  }

  /** Known anime titles, most used first (autocomplete). */
  async getAnime(options: { q?: string; limit?: number } = {}): Promise<NameCount[]> {
    return (await request<{ data: NameCount[] }>(this.http, 'GET', '/anime', { query: { ...options } })).data;
  }

  /** Known characters, most used first (autocomplete). */
  async getCharacters(options: { q?: string; limit?: number } = {}): Promise<NameCount[]> {
    return (await request<{ data: NameCount[] }>(this.http, 'GET', '/characters', { query: { ...options } })).data;
  }

  /** The account behind the key (tier, rate limit). */
  async getMe(): Promise<Me> {
    return (await request<{ data: Me }>(this.http, 'GET', '/me')).data;
  }

  /**
   * Walks through every page of a search, one GIF at a time.
   * `for await (const gif of gifuto.iterateGifs({ tag: 'hug' })) { … }`
   * Stops after `maxPages` pages (default 200) as a safety net.
   */
  async *iterateGifs(options: Omit<SearchOptions, 'page'> & { maxPages?: number } = {}): AsyncGenerator<Gif, void, undefined> {
    const { maxPages = 200, ...search } = options;
    for (let page = 1; page <= maxPages; page++) {
      const res = await this.searchGifs({ ...search, page });
      yield* res.data;
      if (page >= res.meta.totalPages) return;
    }
  }

  /* ───────────── Favorites ───────────── */

  async getFavorites(options: PageOptions = {}): Promise<Page<FavoriteGif>> {
    return request<Page<FavoriteGif>>(this.http, 'GET', '/me/favorites', { query: { ...options } });
  }

  async addFavorite(gifId: string): Promise<FavoriteResult> {
    return (await request<{ data: FavoriteResult }>(this.http, 'PUT', `/me/favorites/${encodeURIComponent(gifId)}`)).data;
  }

  async removeFavorite(gifId: string): Promise<FavoriteResult> {
    return (await request<{ data: FavoriteResult }>(this.http, 'DELETE', `/me/favorites/${encodeURIComponent(gifId)}`)).data;
  }

  /* ───────────── Collections ───────────── */

  async getCollections(): Promise<Collection[]> {
    return (await request<{ data: Collection[] }>(this.http, 'GET', '/me/collections')).data;
  }

  /** One collection with a page of its GIFs. */
  async getCollection(id: string, options: PageOptions = {}): Promise<{ collection: CollectionWithGifs; meta: PageMeta }> {
    const res = await request<{ data: CollectionWithGifs; meta: PageMeta }>(this.http, 'GET', `/me/collections/${encodeURIComponent(id)}`, { query: { ...options } });
    return { collection: res.data, meta: res.meta };
  }

  /** Throws `ApiError` with code `name_taken` (409) if you already have a collection with this name. */
  async createCollection(input: CollectionInput): Promise<Collection> {
    return (await request<{ data: Collection }>(this.http, 'POST', '/me/collections', { body: input })).data;
  }

  async updateCollection(id: string, input: Partial<CollectionInput>): Promise<Collection> {
    return (await request<{ data: Collection }>(this.http, 'PATCH', `/me/collections/${encodeURIComponent(id)}`, { body: input })).data;
  }

  async deleteCollection(id: string): Promise<void> {
    await request<void>(this.http, 'DELETE', `/me/collections/${encodeURIComponent(id)}`);
  }

  async addToCollection(collectionId: string, gifId: string): Promise<void> {
    await request<unknown>(this.http, 'PUT', `/me/collections/${encodeURIComponent(collectionId)}/gifs/${encodeURIComponent(gifId)}`);
  }

  async removeFromCollection(collectionId: string, gifId: string): Promise<void> {
    await request<unknown>(this.http, 'DELETE', `/me/collections/${encodeURIComponent(collectionId)}/gifs/${encodeURIComponent(gifId)}`);
  }

  /** Suggest a GIF: it goes to the moderation queue. Never retried automatically. */
  async suggestGif(input: SuggestInput): Promise<SuggestResult> {
    return (await request<{ data: SuggestResult }>(this.http, 'POST', '/gifs/suggest', { body: input })).data;
  }
}

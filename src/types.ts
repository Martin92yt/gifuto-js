/** Types of the Gifuto API v1 (see /api/v1/openapi.json). Within v1 the API only adds fields. */

export type Tier = 'member' | 'contributor' | 'trusted' | 'curator';

export interface Gif {
  id: string;
  /** Direct link to the media on its original host. */
  url: string;
  /** Official title, `null` when unknown. */
  anime: string | null;
  /** "Family name, Given name". */
  characters: string[];
  episode: string | null;
  malAnimeId: number | null;
  malCharacterIds: number[];
  tags: { primary: string | null; secondary: string[] };
  submittedBy: { username: string; tier: Tier; /** @deprecated use `tier` */ contributor?: boolean } | null;
  hits: number;
  createdAt: string;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Page<T> {
  data: T[];
  meta: PageMeta;
}

export interface Tag {
  slug: string;
  label: string;
  count: number;
}

export interface NameCount {
  name: string;
  count: number;
}

export interface Me {
  username: string;
  role: 'user' | 'moderator' | 'admin';
  tier: Tier;
  /** `null` = unlimited. */
  rateLimitPerMinute: number | null;
  memberSince: string;
}

export interface RandomOptions {
  /** Tag slug, e.g. `hug`. */
  tag?: string;
  excludeTags?: string[];
  /** GIF ids to avoid (max 50). */
  excludeIds?: string[];
  excludeAnime?: string[];
  /**
   * Remembers the GIFs already returned under this name (e.g. a channel or guild id) and avoids
   * them next time. In-memory only, per client instance.
   */
  noRepeat?: string;
}

export interface SearchOptions {
  q?: string;
  scope?: 'all' | 'anime' | 'character' | 'tag';
  tag?: string;
  anime?: string;
  sort?: 'recent' | 'popular' | 'random';
  page?: number;
  /** 1 to 50, default 20. */
  limit?: number;
}

export interface SuggestInput {
  url: string;
  primaryTag: string;
  secondaryTags?: string[];
  animeName?: string;
  characters?: string[];
  episode?: string;
  malAnimeId?: number;
  malCharacterIds?: number[];
}

export interface SuggestResult {
  id: string;
  status: string;
  message: string;
}

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  count: number;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionInput {
  /** 2 to 40 characters. */
  name: string;
  description?: string;
  isPublic?: boolean;
}

export type CollectionWithGifs = Collection & { gifs: Gif[] };

export interface PageOptions {
  page?: number;
  /** 1 to 50, default 20. */
  limit?: number;
}

export interface FavoriteResult {
  gifId: string;
  favorite: boolean;
}

/** A favorite GIF also carries the date it was added. */
export type FavoriteGif = Gif & { favoritedAt?: string };

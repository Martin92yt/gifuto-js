import { describe, expect, it, vi } from 'vitest';
import { AuthError, Gifuto, NetworkError, NotFoundError, RateLimitError, ValidationError } from '../src';

const gif = (id: string) => ({
  id, url: `https://media.tenor.com/${id}.gif`, anime: 'Toradora!', characters: [], episode: null,
  malAnimeId: 4224, malCharacterIds: [], tags: { primary: 'hug', secondary: [] }, submittedBy: null, hits: 0, createdAt: '2026-11-05T00:00:00Z',
});
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const client = (fetch: typeof globalThis.fetch, extra = {}) =>
  new Gifuto({ apiKey: 'sgif_test', baseUrl: 'https://x.test/api/v1', fetch, maxRetryWaitMs: 50, ...extra });

describe('Gifuto client', () => {
  it('requires an API key', () => {
    expect(() => new Gifuto({ apiKey: '  ' })).toThrow(/API key/);
  });

  it('sends the key and builds the query string', async () => {
    const f = vi.fn().mockResolvedValue(json(200, { data: gif('a') }));
    await client(f).getRandomGif({ tag: 'hug', excludeTags: ['kiss', 'bite'] });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('https://x.test/api/v1/gifs/random?tag=hug&excludeTags=kiss%2Cbite');
    expect(init.headers['X-API-Key']).toBe('sgif_test');
  });

  it('avoids repeats per name and resets when everything was sent', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json(200, { data: gif('a') }))
      .mockResolvedValueOnce(json(404, { error: { code: 'no_gif_found', message: 'none' } }))
      .mockResolvedValueOnce(json(200, { data: gif('a') }));
    const c = client(f);
    await c.getRandomGif({ tag: 'hug', noRepeat: 'chan1' });
    const again = await c.getRandomGif({ tag: 'hug', noRepeat: 'chan1' });
    expect(f.mock.calls[1]![0]).toContain('excludeIds=a');
    expect(f.mock.calls[2]![0]).not.toContain('excludeIds');
    expect(again.id).toBe('a');
  });

  it('maps errors to classes', async () => {
    const bad = (status: number, code: string, h = {}) =>
      client(vi.fn().mockResolvedValue(json(status, { error: { code, message: 'm', requestId: 'r1' } }, h)), { maxRetries: 0 });
    await expect(bad(401, 'invalid_api_key').getTags()).rejects.toBeInstanceOf(AuthError);
    await expect(bad(404, 'gif_not_found').getGifById('x')).rejects.toBeInstanceOf(NotFoundError);
    await expect(bad(422, 'validation_error').searchGifs()).rejects.toBeInstanceOf(ValidationError);
    const e = await bad(429, 'rate_limited_key', { 'retry-after': '7' }).getTags().catch((x) => x);
    expect(e).toBeInstanceOf(RateLimitError);
    expect(e.retryAfter).toBe(7);
    expect(e.requestId).toBe('r1');
  });

  it('retries a 429 on GET using Retry-After, then succeeds', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json(429, { error: { code: 'rate_limited_key', message: 'slow' } }, { 'retry-after': '0' }))
      .mockResolvedValueOnce(json(200, { data: [{ slug: 'hug', label: 'Hug', count: 3 }] }));
    expect(await client(f).getTags()).toHaveLength(1);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('does not wait longer than maxRetryWaitMs', async () => {
    const f = vi.fn().mockResolvedValue(json(429, { error: { code: 'rate_limited_key', message: 's' } }, { 'retry-after': '30' }));
    await expect(client(f).getTags()).rejects.toBeInstanceOf(RateLimitError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('never retries POST', async () => {
    const f = vi.fn().mockResolvedValue(json(500, { error: { code: 'internal', message: 'x' } }));
    await expect(client(f).suggestGif({ url: 'https://media.tenor.com/a.gif', primaryTag: 'hug' })).rejects.toThrow();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('wraps network failures', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    await expect(client(f, { maxRetries: 1 }).getTags()).rejects.toBeInstanceOf(NetworkError);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('iterates over every page of a search', async () => {
    const page = (n: number, ids: string[]) =>
      json(200, { data: ids.map(gif), meta: { page: n, limit: 2, total: 3, totalPages: 2 } });
    const f = vi.fn().mockResolvedValueOnce(page(1, ['a', 'b'])).mockResolvedValueOnce(page(2, ['c']));
    const ids: string[] = [];
    for await (const g of client(f).iterateGifs({ tag: 'hug', limit: 2 })) ids.push(g.id);
    expect(ids).toEqual(['a', 'b', 'c']);
    expect(f.mock.calls[1]![0]).toContain('page=2');
  });

  it('favorites and collections hit the right routes', async () => {
    const f = vi.fn().mockImplementation(async () => json(200, { data: {} }));
    const c = client(f);
    await c.addFavorite('g 1');
    await c.removeFavorite('g1');
    await c.addToCollection('c1', 'g1');
    await c.createCollection({ name: 'Cute' });
    await c.updateCollection('c1', { isPublic: true });
    const calls = f.mock.calls.map(([u, i]) => `${i.method} ${String(u).replace('https://x.test/api/v1', '')}`);
    expect(calls).toEqual([
      'PUT /me/favorites/g%201',
      'DELETE /me/favorites/g1',
      'PUT /me/collections/c1/gifs/g1',
      'POST /me/collections',
      'PATCH /me/collections/c1',
    ]);
  });

  it('deleteCollection accepts an empty 204 answer', async () => {
    const f = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(client(f).deleteCollection('c1')).resolves.toBeUndefined();
  });

  it('retries idempotent PUT but not PATCH', async () => {
    const fail = () => json(500, { error: { code: 'internal', message: 'x' } });
    const put = vi.fn().mockResolvedValueOnce(fail()).mockResolvedValueOnce(json(200, { data: {} }));
    await client(put).addFavorite('g1');
    expect(put).toHaveBeenCalledTimes(2);
    const patch = vi.fn().mockResolvedValue(fail());
    await expect(client(patch).updateCollection('c1', { name: 'xx' })).rejects.toThrow();
    expect(patch).toHaveBeenCalledTimes(1);
  });
});

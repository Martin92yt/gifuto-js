import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Gifuto } from '../src';

/**
 * Keeps the client in step with the API: spec/openapi.json is a copy of the API's
 * /api/v1/openapi.json (refresh it with `npm run spec:update`). Every operation of the
 * spec except the ones listed here must have a client method.
 */
const spec = JSON.parse(readFileSync(new URL('../spec/openapi.json', import.meta.url), 'utf8'));

const OPERATION_TO_METHOD: Record<string, string> = {
  randomGif: 'getRandomGif', searchGifs: 'searchGifs', getGif: 'getGifById', suggestGif: 'suggestGif',
  listTags: 'getTags', listAnime: 'getAnime', listCharacters: 'getCharacters', getMe: 'getMe',
  listFavorites: 'getFavorites', addFavorite: 'addFavorite', removeFavorite: 'removeFavorite',
  listCollections: 'getCollections', createCollection: 'createCollection', getCollection: 'getCollection',
  updateCollection: 'updateCollection', deleteCollection: 'deleteCollection',
  addToCollection: 'addToCollection', removeFromCollection: 'removeFromCollection',
};

describe('contract with the API spec', () => {
  const operations: string[] = Object.values<any>(spec.paths).flatMap((p) =>
    Object.values<any>(p).map((op) => op.operationId).filter(Boolean),
  );

  it('maps every API operation to a client method', () => {
    for (const id of operations) {
      const method = OPERATION_TO_METHOD[id];
      expect(method, `operation ${id} has no entry in OPERATION_TO_METHOD`).toBeTruthy();
      expect(typeof (Gifuto.prototype as any)[method!], `Gifuto.${method} is missing`).toBe('function');
    }
  });

  it('has no stale mapping', () => {
    for (const id of Object.keys(OPERATION_TO_METHOD)) expect(operations).toContain(id);
  });
});

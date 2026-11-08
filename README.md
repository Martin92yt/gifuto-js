# gifuto

TypeScript client for the [Gifuto](https://gifuto.vercel.app) API: curated, family-friendly anime GIF URLs for Discord bots. Zero dependencies, native `fetch`, Node 18+, ESM and CommonJS.

```bash
npm install gifuto
```

```ts
import { Gifuto } from 'gifuto';

const gifuto = new Gifuto({ apiKey: process.env.GIFUTO_API_KEY! }); // key from your Gifuto profile

const gif = await gifuto.getRandomGif({ tag: 'hug', noRepeat: channelId });
console.log(gif.url, gif.anime);
```

## Methods

| Method | What it does |
| --- | --- |
| `getRandomGif({ tag, excludeTags, excludeIds, excludeAnime, noRepeat })` | One random GIF. `noRepeat: "<name>"` remembers what was sent under that name (channel, guild…) and avoids it. |
| `searchGifs({ q, scope, tag, anime, sort, page, limit })` | `{ data, meta }` page of results. |
| `getGifById(id)` | One GIF. |
| `getTags()` | Tags with their GIF count. |
| `getAnime()` / `getCharacters()` | Names, most used first. |
| `getMe()` | Your tier and rate limit. |
| `suggestGif(input)` | Sends a GIF to the moderation queue. |
| `iterateGifs({ …search, maxPages })` | Async iterator over every page: `for await (const gif of gifuto.iterateGifs({ tag: 'hug' }))`. |
| `getFavorites()` / `addFavorite(id)` / `removeFavorite(id)` | The account's favorites. |
| `getCollections()` / `getCollection(id)` / `createCollection()` / `updateCollection()` / `deleteCollection()` | Collections. |
| `addToCollection(collectionId, gifId)` / `removeFromCollection(…)` | Collection content. |

## Errors

Every error extends `GifutoError` (`code`, `status`, `requestId`). Rely on `code`, never on the message.
`AuthError` (401/403), `NotFoundError` (404), `ValidationError` (422, `details`), `RateLimitError` (429, `retryAfter` seconds), `ApiError` (other), `NetworkError` (offline, timeout).

Idempotent requests (GET, PUT, DELETE) are retried automatically on 429 (honouring `Retry-After`), 5xx and network errors (default 2 retries, never waiting more than 5 s). `PUT` and `DELETE` are idempotent and retried the same way; `POST` and `PATCH` never are. Options: `timeoutMs`, `maxRetries`, `maxRetryWaitMs`, `baseUrl`, `fetch`.

See `examples/discord-hug.ts` for a discord.js command.

## Keeping in step with the API

`spec/openapi.json` is a copy of the API contract; `npm run spec:update` refreshes it and the contract test fails if an API operation has no client method.

## Releasing

Bump `version` and `CHANGELOG.md`, push a tag, create a GitHub release: the `publish` workflow runs the checks and publishes to npm (add the `NPM_TOKEN` secret first).

## Development

```bash
npm install
npm run typecheck && npm test && npm run build
```

MIT

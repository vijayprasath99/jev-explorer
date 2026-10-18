# CLAUDE.md

## What this is

A local, dependency-free Node.js server + browser UI for building and sending
requests to any `/v1/systemone`-compatible endpoint (TypeSafe AI's hosted Jev
service, a local LM Studio model, or OpenRouter). The server proxies requests
so the browser never deals with CORS and the API key never reaches the client.

## Running it

```bash
cp .env.example .env   # fill in JEV_ENDPOINT / JEV_API_KEY / JEV_MODEL
npm start               # serves on http://localhost:3000 (or $PORT)
```

No build step, no npm dependencies, no test suite. `server.js` uses Node's
built-in `fetch`, so Node 18+ is required.

## Structure

- `server.js` — single-file Node HTTP server: static file serving from
  `public/`, a tiny built-in `.env` loader, and two API routes
  (`/api/config`, `/api/jev-proxy`).
- `public/` — the browser UI (plain HTML/CSS/JS, no framework/bundler).
- `.env` — local secrets (gitignored); `.env.example` documents the shape.

## Conventions

- Keep it dependency-free. Don't introduce a package manager lockfile,
  bundler, or framework unless explicitly asked — the whole point of this
  project is a zero-install local tool.
- The API key must never be sent to the browser or logged. `/api/config`
  only reports whether a key is configured (`hasApiKey`), never the value.
- Env vars are loaded once at startup (`loadDotEnvFile` in `server.js`);
  changing `.env` requires restarting the server.

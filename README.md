# Jev REST Explorer

A local, dependency-free Node server + browser UI for building and sending
requests to any `/v1/systemone`-compatible endpoint — TypeSafe AI's hosted
Jev service, a local LM Studio model, or any model routed through
OpenRouter. It proxies your requests server-side so the browser never has
to deal with CORS, and it keeps your API key out of the browser entirely.

## Requirements

- Node.js 18 or newer (the server uses the built-in `fetch`)
- No npm dependencies to install

## Setup

1. Clone/copy this folder and open it in a terminal.
2. Copy the example env file:

   ```bash
   cp .env.example .env
   ```

3. Edit `.env` and fill in the three variables (see the backend-specific
   sections below for what to put in each one):

   ```bash
   JEV_ENDPOINT=...   # which backend to talk to
   JEV_API_KEY=...    # credential for that backend, if it needs one
   JEV_MODEL=...       # default model name shown in the UI
   ```

4. Start the server:

   ```bash
   npm start
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

The terminal log on startup echoes back the endpoint, whether a key is
configured, and the default model, so you can sanity-check your `.env`
before touching the UI:

```
Jev API Explorer running at http://localhost:3000
  Endpoint: http://localhost:1234/v1/systemone
  API key:  configured
  Model:    jev-latest
```

`PORT` can also be set in `.env` if `3000` is taken.

## Connecting to a backend

All three backends speak the same `/v1/systemone` request/response shape —
switching between them is just a matter of changing `JEV_ENDPOINT` (and the
matching key) in `.env` and restarting the server.

### LM Studio (local)

Run a model locally and point the app at it — no API key required.

1. In LM Studio, load a model and start its local server (Developer tab →
   Start Server). Make sure it's serving the `/v1/systemone`-compatible
   route on port `1234`.
2. Set:

   ```bash
   JEV_ENDPOINT=http://localhost:1234/v1/systemone
   JEV_API_KEY=
   JEV_MODEL=<the model name LM Studio loaded>
   ```

   LM Studio typically doesn't check the `Authorization` header for local
   use, so `JEV_API_KEY` can be left blank or set to any placeholder value.

### OpenRouter

Route requests through OpenRouter to any model it hosts.

1. Get an API key from [openrouter.ai](https://openrouter.ai) (Keys page in
   your account settings).
2. Set:

   ```bash
   JEV_ENDPOINT=https://openrouter.ai/api/v1/systemone
   JEV_API_KEY=sk-or-v1-...
   JEV_MODEL=<an OpenRouter model slug>
   ```

### JEV (TypeSafe AI's hosted service)

Talk directly to TypeSafe AI's production Jev endpoint.

1. Get an API key from your TypeSafe AI / Jev account.
2. Set:

   ```bash
   JEV_ENDPOINT=https://api.typesafe.ai/v1/systemone
   JEV_API_KEY=<your TypeSafe AI key>
   JEV_MODEL=jev-latest
   ```

## Using the UI

- **Presets** (left panel) load example requests — ticket triage, yes/no,
  choice, score, array state, object state — so you can see the request
  shape before building your own.
- **Request body editor** builds the JSON payload for you field by field:
  - `state` can be a plain string, an array, a flat object, or
    **`json (raw)`** — pick `json (raw)` from the type dropdown next to
    `"state"` to paste or type arbitrary nested JSON (nested objects/arrays,
    numbers, booleans, `null`). It validates as you type and blocks sending
    until the JSON is valid.
  - `model` is pre-filled from `JEV_MODEL` but editable per request.
  - `questions` lets you add yes/no, multiple-choice, or score questions
    with their own criteria.
- **Send Request** posts the built payload to `/api/jev-proxy`, which the
  server forwards to whatever `JEV_ENDPOINT` currently points at, and shows
  the raw upstream response, status, and latency.
- The **Config** readout at the top of the page shows the active endpoint
  and whether a key is configured — handy for confirming which backend
  you're currently wired to without exposing the key itself.

## Troubleshooting

- **"Can't reach local service"** — the Node server isn't running; run
  `npm start` and make sure you're loading the page from
  `http://localhost:<PORT>`.
- **Proxy error / non-2xx upstream status** — check `JEV_ENDPOINT` and
  `JEV_API_KEY` in `.env`, then restart the server (env changes aren't
  picked up until restart).
- **LM Studio connection refused** — confirm the local server is started
  in LM Studio and listening on the port you set in `JEV_ENDPOINT`.

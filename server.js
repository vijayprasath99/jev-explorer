const http = require("http");
const fs = require("fs");
const path = require("path");

loadDotEnvFile();

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const JEV_ENDPOINT = process.env.JEV_ENDPOINT || "https://openrouter.ai/api/v1/systemone";
const JEV_API_KEY = process.env.JEV_API_KEY || "";
const JEV_MODEL = process.env.JEV_MODEL || "jev-latest";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

// Tiny built-in .env loader so you can keep JEV_ENDPOINT / JEV_API_KEY out of
// your shell history without adding a dependency. Real env vars always win.
function loadDotEnvFile() {
  const envPath = path.join(__dirname, ".env");
  let contents;
  try {
    contents = fs.readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  contents.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  });
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  let reqPath = decodeURIComponent(req.url.split("?")[0]);
  if (reqPath === "/") reqPath = "/index.html";

  const filePath = path.normalize(path.join(PUBLIC_DIR, reqPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/config" && req.method === "GET") {
    // The key itself never leaves the server — only whether one is set.
    return sendJson(res, 200, { endpoint: JEV_ENDPOINT, hasApiKey: Boolean(JEV_API_KEY), model: JEV_MODEL });
  }

  if (pathname === "/api/jev-proxy" && req.method === "POST") {
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendJson(res, 400, { error: "invalid_json", message: "Request body must be valid JSON." });
    }

    try {
      const upstream = await fetch(JEV_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${JEV_API_KEY}`,
        },
        body: JSON.stringify(body.payload || {}),
      });

      const text = await upstream.text();
      let parsedBody;
      try {
        parsedBody = JSON.parse(text);
      } catch {
        parsedBody = text;
      }

      return sendJson(res, 200, {
        upstreamStatus: upstream.status,
        upstreamStatusText: upstream.statusText,
        body: parsedBody,
      });
    } catch (err) {
      return sendJson(res, 502, { error: "proxy_error", message: err.message });
    }
  }

  return sendJson(res, 404, { error: "not_found", message: "No such API route." });
}

const server = http.createServer((req, res) => {
  const pathname = req.url.split("?")[0];
  if (pathname.startsWith("/api/")) {
    handleApi(req, res, pathname).catch((err) =>
      sendJson(res, 500, { error: "internal_error", message: err.message })
    );
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`Jev API Explorer running at http://localhost:${PORT}`);
  console.log(`  Endpoint: ${JEV_ENDPOINT}`);
  console.log(`  API key:  ${JEV_API_KEY ? "configured" : "not set"}`);
  console.log(`  Model:    ${JEV_MODEL}`);
});

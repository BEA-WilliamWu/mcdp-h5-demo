import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { handleMcdpProxyRequest, loadLocalEnv, resolveProxyConfig, setCors } from "./proxy/mcdpProxy.mjs";

const demoDir = fileURLToPath(new URL(".", import.meta.url));
const distDir = normalize(join(demoDir, "dist"));
const port = Number(process.env.PORT || 5177);
const localEnv = loadLocalEnv(demoDir);
const proxyConfig = resolveProxyConfig(localEnv);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon"
};

function serverErrorPayload(error) {
  return {
    success: false,
    message: error.message,
    code: error.code || error.cause?.code || "",
    cause: error.cause?.message || "",
    causeCode: error.cause?.code || error.cause?.cause?.code || "",
    nodeVersion: process.version,
    httpProxyConfigured: Boolean(process.env.HTTP_PROXY || process.env.http_proxy),
    httpsProxyConfigured: Boolean(process.env.HTTPS_PROXY || process.env.https_proxy),
    extraCaConfigured: Boolean(process.env.NODE_EXTRA_CA_CERTS)
  };
}

async function serveStatic(req, res, requestUrl) {
  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === "/" || pathname === "/mcdp-h5-demo/") {
    pathname = "/index.html";
  }
  if (pathname.startsWith("/mcdp-h5-demo/")) {
    pathname = pathname.slice("/mcdp-h5-demo".length);
  }

  const candidate = normalize(join(distDir, pathname));
  if (!candidate.startsWith(distDir)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(candidate);
    if (fileStat.isFile()) {
      res.writeHead(200, {
        "Content-Type": mimeTypes[extname(candidate)] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      createReadStream(candidate).pipe(res);
      return;
    }
  } catch (error) {
    // Fall through to SPA fallback.
  }

  const fallback = join(distDir, "index.html");
  try {
    await stat(fallback);
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    createReadStream(fallback).pipe(res);
  } catch (error) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Run `npm run build` before `npm run preview`.");
  }
}

createServer(async function (req, res) {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (await handleMcdpProxyRequest(req, res, proxyConfig)) {
      return;
    }
    await serveStatic(req, res, requestUrl);
  } catch (error) {
    setCors(res);
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(serverErrorPayload(error), null, 2));
  }
}).listen(port, function () {
  console.log(`MCDP H5 Vue demo: http://localhost:${port}/`);
  console.log(`MCDP report proxy: /mgw.htm -> ${proxyConfig.reportURL}`);
  console.log(`MCDP upload proxy: /mdap/* -> ${proxyConfig.uploadURL}`);
  console.log(`MCDP tenant override: ${proxyConfig.tenantId}`);
  console.log(`MCDP proxy signing: ${proxyConfig.appSecret ? "enabled" : "disabled"}`);
});

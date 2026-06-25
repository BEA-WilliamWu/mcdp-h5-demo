import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { join } from "node:path";
import { connect as tlsConnect } from "node:tls";

const DEFAULT_REPORT_URL = "https://mgw.mpaas.cn-hongkong.aliyuncs.com/mgw.htm";
const DEFAULT_UPLOAD_URL = "https://mdap.mpaas.cn-hongkong.aliyuncs.com";
const DEFAULT_TENANT_ID = "KKSGIQRA";
const REPORT_OPERATION_TYPE = "alipay.mcdp.space.querySpaceInfo";

export function loadLocalEnv(cwd) {
  const env = {};
  for (const filename of [".env", ".env.local"]) {
    try {
      const content = readFileSync(join(cwd, filename), "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
          continue;
        }
        const separator = trimmed.indexOf("=");
        if (separator === -1) {
          continue;
        }
        const key = trimmed.slice(0, separator).trim();
        const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
        env[key] = value;
      }
    } catch (error) {
      // Local env files are optional.
    }
  }
  return env;
}

export function resolveProxyConfig(env = {}) {
  return {
    reportURL: env.reportURL || env.MCDP_REPORT_URL || process.env.MCDP_REPORT_URL || DEFAULT_REPORT_URL,
    uploadURL: env.uploadURL || env.MCDP_UPLOAD_URL || process.env.MCDP_UPLOAD_URL || DEFAULT_UPLOAD_URL,
    tenantId: env.tenantId || env.MCDP_TENANT_ID || process.env.MCDP_TENANT_ID || DEFAULT_TENANT_ID,
    appSecret: env.appSecret || env.MCDP_APP_SECRET || process.env.MCDP_APP_SECRET || ""
  };
}

export function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, X-Requested-With, appId, workspaceId, tenantId, Operation-Type, Version, Ts, SignType, Sign, Platform");
  res.setHeader("Access-Control-Expose-Headers", "result-status, memo, tips, result-message, x-mgw-traceid, x-mgw-error-code");
}

function forwardHeaders(req) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (["host", "origin", "referer", "connection", "content-length", "accept-encoding"].includes(key.toLowerCase())) {
      continue;
    }
    headers[key] = value;
  }
  return headers;
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function signMgwHeaders(headers, body, config) {
  const signedHeaders = {
    ...headers,
    tenantid: config.tenantId
  };

  if (!body || !config.appSecret) {
    return signedHeaders;
  }

  const ts = signedHeaders.ts || signedHeaders.Ts || String(Date.now());
  const operationType = signedHeaders["operation-type"] || signedHeaders["Operation-Type"] || REPORT_OPERATION_TYPE;
  const requestData = Buffer.from(body.toString("utf8"), "utf8").toString("base64");
  const signPayload = `Operation-Type=${operationType}&Request-Data=${requestData}&Ts=${ts}`;
  const sign = createHmac("sha256", config.appSecret).update(signPayload).digest("hex");

  delete signedHeaders.Ts;
  delete signedHeaders.SignType;
  delete signedHeaders.Sign;
  delete signedHeaders.tenantId;
  signedHeaders.ts = ts;
  signedHeaders.signtype = "hmacsha256";
  signedHeaders.sign = sign;
  return signedHeaders;
}

function errorPayload(error, extra = {}) {
  return {
    success: false,
    ...extra,
    message: error.message,
    code: error.code || error.cause?.code || "",
    cause: error.cause?.message || ""
  };
}

function writeJSON(res, status, payload) {
  setCors(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload, null, 2));
}

function getProxyURL(targetURL) {
  const parsed = new URL(targetURL);
  if (parsed.protocol === "https:") {
    return process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || "";
  }
  if (parsed.protocol === "http:") {
    return process.env.HTTP_PROXY || process.env.http_proxy || "";
  }
  return "";
}

function describeProxyURL(proxyURLString) {
  if (!proxyURLString) {
    return "";
  }
  try {
    const proxyURL = new URL(proxyURLString);
    return `${proxyURL.protocol}//${proxyURL.hostname}${proxyURL.port ? `:${proxyURL.port}` : ""}`;
  } catch (error) {
    return "invalid proxy URL";
  }
}

function proxyAuthHeader(proxyURL) {
  if (!proxyURL.username && !proxyURL.password) {
    return "";
  }
  const username = decodeURIComponent(proxyURL.username || "");
  const password = decodeURIComponent(proxyURL.password || "");
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function normalizeResponseHeaders(headers) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value || "";
  }
  return {
    get(name) {
      return normalized[name.toLowerCase()] || null;
    }
  };
}

function requestWithHttpProxy(targetURL, method, headers, body, proxyURLString) {
  return new Promise((resolve, reject) => {
    const target = new URL(targetURL);
    const proxyURL = new URL(proxyURLString);
    if (proxyURL.protocol !== "http:") {
      reject(new Error(`Only http:// proxy URLs are supported by this demo server. Current proxy: ${proxyURL.protocol}`));
      return;
    }

    const targetPort = target.port || "443";
    const targetHost = `${target.hostname}:${targetPort}`;
    const connectHeaders = { Host: targetHost };
    const proxyAuth = proxyAuthHeader(proxyURL);
    if (proxyAuth) {
      connectHeaders["Proxy-Authorization"] = proxyAuth;
    }

    const connectReq = httpRequest({
      hostname: proxyURL.hostname,
      port: proxyURL.port || 80,
      method: "CONNECT",
      path: targetHost,
      headers: connectHeaders,
      timeout: 30000
    });

    connectReq.once("connect", (connectRes, socket) => {
      if (connectRes.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`HTTP proxy CONNECT failed with status ${connectRes.statusCode || "unknown"}`));
        return;
      }

      const tlsSocket = tlsConnect({ socket, servername: target.hostname });
      tlsSocket.once("secureConnect", () => {
        const requestHeaders = { ...headers };
        if (body && !requestHeaders["content-length"] && !requestHeaders["Content-Length"]) {
          requestHeaders["Content-Length"] = String(body.length);
        }

        const upstreamReq = httpsRequest({
          hostname: target.hostname,
          port: targetPort,
          path: `${target.pathname}${target.search}`,
          method,
          headers: requestHeaders,
          createConnection: () => tlsSocket,
          timeout: 30000
        }, (upstreamRes) => {
          const chunks = [];
          upstreamRes.on("data", (chunk) => chunks.push(chunk));
          upstreamRes.on("end", () => {
            resolve({
              status: upstreamRes.statusCode || 502,
              headers: normalizeResponseHeaders(upstreamRes.headers),
              body: Buffer.concat(chunks)
            });
          });
        });

        upstreamReq.once("timeout", () => upstreamReq.destroy(new Error(`Proxy request to ${targetURL} timed out`)));
        upstreamReq.once("error", reject);
        if (body) {
          upstreamReq.write(body);
        }
        upstreamReq.end();
      });
      tlsSocket.once("error", reject);
    });

    connectReq.once("timeout", () => connectReq.destroy(new Error(`HTTP proxy CONNECT to ${targetHost} timed out`)));
    connectReq.once("error", reject);
    connectReq.end();
  });
}

async function requestWithFetch(targetURL, method, headers, body) {
  const upstreamResponse = await fetch(targetURL, {
    method,
    headers,
    body
  });
  return {
    status: upstreamResponse.status,
    headers: upstreamResponse.headers,
    body: Buffer.from(await upstreamResponse.arrayBuffer())
  };
}

async function sendUpstreamRequest(targetURL, method, headers, body) {
  const proxyURL = getProxyURL(targetURL);
  if (proxyURL) {
    return requestWithHttpProxy(targetURL, method, headers, body, proxyURL);
  }
  return requestWithFetch(targetURL, method, headers, body);
}

async function proxyRequest(req, res, targetURL, config, options = {}) {
  if (req.method === "OPTIONS") {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (typeof fetch !== "function") {
    throw new Error("Node.js global fetch is not available. Please use Node.js 18 or newer.");
  }

  const method = req.method || "GET";
  const body = ["GET", "HEAD"].includes(method) ? undefined : await readRequestBody(req);
  const headers = options.signReport
    ? signMgwHeaders(forwardHeaders(req), body, config)
    : forwardHeaders(req);
  let upstreamResponse;
  try {
    upstreamResponse = await sendUpstreamRequest(targetURL, method, headers, body);
  } catch (error) {
    throw new Error(`Proxy request to ${targetURL} failed: ${error.message}`, { cause: error });
  }
  const responseBody = upstreamResponse.body;
  const contentType = upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8";
  const diagnosticHeaders = [
    "result-status",
    "memo",
    "tips",
    "result-message",
    "x-mgw-traceid",
    "x-mgw-error-code"
  ];
  const responseHeaders = {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  };

  for (const header of diagnosticHeaders) {
    const value = upstreamResponse.headers.get(header);
    if (value) {
      responseHeaders[header] = value;
    }
  }

  setCors(res);
  res.writeHead(upstreamResponse.status, responseHeaders);
  res.end(responseBody);
}

async function testConnection(res, config) {
  const startedAt = Date.now();
  const proxyURL = getProxyURL(config.reportURL);
  if (!proxyURL && typeof fetch !== "function") {
    writeJSON(res, 500, {
      success: false,
      reportURL: config.reportURL,
      nodeVersion: process.version,
      fetchAvailable: false,
      message: "Node.js global fetch is not available. Please use Node.js 18 or newer."
    });
    return;
  }

  try {
    const upstreamResponse = await sendUpstreamRequest(config.reportURL, "GET", { "Cache-Control": "no-store" });
    writeJSON(res, 200, {
      success: true,
      reportURL: config.reportURL,
      proxyUsed: Boolean(proxyURL),
      proxyURL: describeProxyURL(proxyURL),
      upstreamStatus: upstreamResponse.status,
      resultStatus: upstreamResponse.headers.get("result-status") || "",
      contentType: upstreamResponse.headers.get("content-type") || "",
      elapsedMs: Date.now() - startedAt
    });
  } catch (error) {
    writeJSON(res, 500, errorPayload(error, {
      reportURL: config.reportURL,
      nodeVersion: process.version,
      fetchAvailable: true,
      proxyUsed: Boolean(proxyURL),
      proxyURL: describeProxyURL(proxyURL),
      elapsedMs: Date.now() - startedAt
    }));
  }
}

export async function handleMcdpProxyRequest(req, res, configInput = {}) {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const config = resolveProxyConfig(configInput);

  if (requestUrl.pathname === "/api/mcdp-proxy-status") {
    writeJSON(res, 200, {
      reportURL: config.reportURL,
      uploadURL: config.uploadURL,
      tenantId: config.tenantId,
      proxySigning: Boolean(config.appSecret),
      nodeVersion: process.version,
      fetchAvailable: typeof fetch === "function",
      httpProxyConfigured: Boolean(process.env.HTTP_PROXY || process.env.http_proxy),
      httpsProxyConfigured: Boolean(process.env.HTTPS_PROXY || process.env.https_proxy),
      effectiveReportProxy: describeProxyURL(getProxyURL(config.reportURL)),
      extraCaConfigured: Boolean(process.env.NODE_EXTRA_CA_CERTS)
    });
    return true;
  }

  if (requestUrl.pathname === "/api/mcdp-connection-test") {
    await testConnection(res, config);
    return true;
  }

  if (requestUrl.pathname === "/mgw.htm") {
    await proxyRequest(req, res, config.reportURL, config, { signReport: true });
    return true;
  }

  if (requestUrl.pathname.startsWith("/mdap")) {
    const targetURL = new URL(requestUrl.pathname.slice("/mdap".length) + requestUrl.search, config.uploadURL);
    await proxyRequest(req, res, targetURL.toString(), config);
    return true;
  }

  return false;
}

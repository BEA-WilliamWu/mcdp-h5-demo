import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
    if (["host", "origin", "referer", "connection", "content-length"].includes(key.toLowerCase())) {
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

async function proxyRequest(req, res, targetURL, config, options = {}) {
  if (req.method === "OPTIONS") {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const body = ["GET", "HEAD"].includes(req.method || "") ? undefined : await readRequestBody(req);
  const headers = options.signReport
    ? signMgwHeaders(forwardHeaders(req), body, config)
    : forwardHeaders(req);
  const upstreamResponse = await fetch(targetURL, {
    method: req.method,
    headers,
    body
  });
  const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());
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

export async function handleMcdpProxyRequest(req, res, configInput = {}) {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const config = resolveProxyConfig(configInput);

  if (requestUrl.pathname === "/api/mcdp-proxy-status") {
    setCors(res);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({
      reportURL: config.reportURL,
      uploadURL: config.uploadURL,
      tenantId: config.tenantId,
      proxySigning: Boolean(config.appSecret)
    }));
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

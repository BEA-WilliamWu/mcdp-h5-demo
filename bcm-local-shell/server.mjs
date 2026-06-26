import dns from 'node:dns'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const host = process.env.HOST || '127.0.0.1'
const port = Number(process.env.PORT || 5175)
const ossHost = 'bcm-pub.oss-cn-hongkong.aliyuncs.com'
const apiHost = 'c86e660649a94346bb9d00a9e621da5d-cn-hongkong.alicloudapi.com'
const backendTunnelHost = '127.0.0.1'
const backendTunnelPort = Number(process.env.BCM_TUNNEL_PORT || 39081)
const backendHost = process.env.BCM_BACKEND_HOST || '8.210.128.44'
const apiProxyMode = process.env.BCM_API_PROXY_MODE || 'tunnel'
const staticMode = process.env.BCM_STATIC_MODE || 'local'
const autoTunnel = process.env.BCM_AUTO_TUNNEL !== '0'
const sshKeyPath = process.env.BCM_SSH_KEY || path.resolve(here, '../deploy/mpaas-bff-ecs.pem')
const localDistRoot = path.resolve(here, '../beacms-vue-v251203/dist')
const staticAddressByHost = {
  [ossHost]: '47.79.64.231',
  [apiHost]: '8.210.102.171'
}

const resolver = new dns.Resolver()
const dnsCache = new Map()
let sshTunnelProcess = null
resolver.setServers(['8.8.8.8', '1.1.1.1'])

function runtimePatch () {
  return `
<script>
(function () {
  var API_ORIGIN = ${JSON.stringify(`https://${apiHost}`)};
  var LOCAL_API_PREFIX = '/api-gateway';

  function rewriteUrl(url) {
    if (!url) return url;
    if (typeof url === 'string') {
      if (url.indexOf(API_ORIGIN) === 0) {
        return LOCAL_API_PREFIX + url.slice(API_ORIGIN.length);
      }
      return url;
    }
    try {
      var parsed = new URL(url.url || String(url), window.location.href);
      if (parsed.origin === API_ORIGIN) {
        return LOCAL_API_PREFIX + parsed.pathname + parsed.search + parsed.hash;
      }
    } catch (err) {}
    return url;
  }

  var nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    arguments[1] = rewriteUrl(url);
    return nativeOpen.apply(this, arguments);
  };

  if (window.fetch) {
    var nativeFetch = window.fetch;
    window.fetch = function (input, init) {
      if (input instanceof Request) {
        var rewritten = rewriteUrl(input.url);
        if (rewritten !== input.url) {
          input = new Request(rewritten, input);
        }
      } else {
        input = rewriteUrl(input);
      }
      return nativeFetch.call(this, input, init);
    };
  }
})();
</script>`
}

function safeScriptJson (value) {
  return JSON.stringify(value).replace(/<\/script/gi, '<\\/script')
}

function shellHtml () {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BCM CMS</title>
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; }
    body { color: #1f2937; font-family: Arial, "PingFang SC", "Microsoft YaHei", sans-serif; background: #f3f5f8; }
    button { height: 32px; padding: 0 14px; border: 1px solid #cfd6e4; border-radius: 4px; color: #1f2937; font: inherit; background: #fff; cursor: pointer; }
    button:disabled { cursor: not-allowed; opacity: 0.55; }
    .shell { display: grid; grid-template-rows: 56px minmax(0, 1fr); width: 100%; height: 100%; }
    .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 8px 14px; border-bottom: 1px solid #d9e0ea; background: #fff; }
    .toolbar h1 { margin: 0; font-size: 16px; font-weight: 600; line-height: 20px; }
    .toolbar p { margin: 2px 0 0; color: #6b7280; font-size: 12px; line-height: 16px; }
    .error { align-self: start; margin: 16px; padding: 12px 14px; border: 1px solid #f3b4b4; border-radius: 4px; color: #9f1d1d; background: #fff1f1; }
    .frame { width: 100%; height: 100%; border: 0; background: #fff; }
  </style>
</head>
<body>
  <main class="shell">
    <header class="toolbar">
      <div>
        <h1>BCM CMS</h1>
        <p id="status">Loading</p>
      </div>
      <button id="reload" type="button">Reload</button>
    </header>
    <section id="error" class="error" hidden></section>
    <iframe id="frame" class="frame" title="BCM CMS"></iframe>
  </main>
  <script>
    const OSS_BASE = '/bcm/';
    const OSS_ENTRY = '/bcm/index.html';
    const RUNTIME_PATCH = ${safeScriptJson(runtimePatch())};
    const statusEl = document.getElementById('status');
    const errorEl = document.getElementById('error');
    const frameEl = document.getElementById('frame');
    const reloadEl = document.getElementById('reload');

    function transformHtml(html) {
      const cleaned = html.replace(/<base\\b[^>]*>/gi, '');
      const injected = '<base href="' + OSS_BASE + '">\\n' + RUNTIME_PATCH;
      if (/<head\\b[^>]*>/i.test(cleaned)) {
        return cleaned.replace(/<head(\\s[^>]*)?>/i, match => match + '\\n' + injected);
      }
      return injected + '\\n' + cleaned;
    }

    async function loadRemoteApp() {
      reloadEl.disabled = true;
      errorEl.hidden = true;
      errorEl.textContent = '';
      statusEl.textContent = 'Loading';
      try {
        const response = await fetch(OSS_ENTRY + '?shell_ts=' + Date.now(), { cache: 'no-store' });
        if (!response.ok) throw new Error('Static app returned ' + response.status);
        frameEl.srcdoc = transformHtml(await response.text());
        statusEl.textContent = 'Loaded ' + new Date().toLocaleTimeString();
      } catch (error) {
        statusEl.textContent = 'Failed';
        errorEl.hidden = false;
        errorEl.textContent = error && error.message ? error.message : String(error);
      } finally {
        reloadEl.disabled = false;
      }
    }

    reloadEl.addEventListener('click', loadRemoteApp);
    loadRemoteApp();
  </script>
</body>
</html>`
}

function transformBcmIndexHtml (html) {
  const cleaned = html.replace(/<base\b[^>]*>/gi, '')
  const injected = `<base href="/bcm/">\n${runtimePatch()}`

  if (/<head\b[^>]*>/i.test(cleaned)) {
    return cleaned.replace(/<head(\s[^>]*)?>/i, match => `${match}\n${injected}`)
  }

  return `${injected}\n${cleaned}`
}

function resolve4 (hostname) {
  if (staticAddressByHost[hostname]) {
    return Promise.resolve(staticAddressByHost[hostname])
  }

  const cached = dnsCache.get(hostname)
  if (cached && cached.expires > Date.now()) {
    return Promise.resolve(cached.address)
  }

  return new Promise((resolve, reject) => {
    resolver.resolve4(hostname, (error, addresses) => {
      if (error || !addresses.length) {
        reject(error || new Error(`No DNS A record found for ${hostname}`))
        return
      }

      const address = addresses[0]
      dnsCache.set(hostname, {
        address,
        expires: Date.now() + 5 * 60 * 1000
      })
      resolve(address)
    })
  })
}

function stripHopByHopHeaders (headers) {
  const nextHeaders = { ...headers }
  delete nextHeaders.host
  delete nextHeaders.connection
  delete nextHeaders['proxy-connection']
  delete nextHeaders.upgrade
  delete nextHeaders.origin
  return nextHeaders
}

function contentTypeFor (filePath) {
  const extname = path.extname(filePath).toLowerCase()
  const types = {
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
  }
  return types[extname] || 'application/octet-stream'
}

function localBcmFilePath (requestUrl) {
  let parsed
  try {
    parsed = new URL(requestUrl || '/', 'http://127.0.0.1')
  } catch {
    return null
  }

  let relativePath
  try {
    relativePath = decodeURIComponent(parsed.pathname).replace(/^\/bcm\/?/, '')
  } catch {
    return null
  }

  if (!relativePath || relativePath.endsWith('/')) relativePath += 'index.html'

  const filePath = path.resolve(localDistRoot, relativePath)
  if (!filePath.startsWith(localDistRoot + path.sep)) return null
  return filePath
}

function serveLocalBcmFile (response, requestUrl) {
  const filePath = localBcmFilePath(requestUrl)
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false
  }

  response.writeHead(200, {
    'content-type': contentTypeFor(filePath),
    'cache-control': filePath.endsWith('index.html')
      ? 'no-cache, no-store, must-revalidate'
      : 'public, max-age=31536000, immutable',
    'x-bcm-local-static': 'true'
  })
  fs.createReadStream(filePath).pipe(response)
  return true
}

function writeProxyHeaders (upstreamResponse, response, extra = {}) {
  const headers = { ...upstreamResponse.headers, ...extra }
  if (headers['content-length']) {
    delete headers['transfer-encoding']
  }
  delete headers['content-disposition']
  delete headers['x-oss-force-download']
  response.writeHead(upstreamResponse.statusCode || 502, headers)
}

function sendProxyResponse (upstreamResponse, response, options = {}) {
  if (!options.transformResponse) {
    writeProxyHeaders(upstreamResponse, response)
    upstreamResponse.pipe(response)
    return
  }

  const chunks = []
  upstreamResponse.on('data', chunk => chunks.push(chunk))
  upstreamResponse.on('end', () => {
    let body = Buffer.concat(chunks)
    const headers = { ...upstreamResponse.headers }

    try {
      const transformed = options.transformResponse(body)
      if (transformed) {
        body = Buffer.isBuffer(transformed) ? transformed : Buffer.from(String(transformed))
        delete headers['content-encoding']
        delete headers['transfer-encoding']
        headers['content-type'] = 'application/json; charset=utf-8'
        headers['content-length'] = String(body.length)
      }
    } catch (error) {
      body = Buffer.from(`Proxy response transform failed: ${error.message}`)
      headers['content-type'] = 'text/plain; charset=utf-8'
      delete headers['content-encoding']
      delete headers['transfer-encoding']
      headers['content-length'] = String(body.length)
    }

    writeProxyHeaders(upstreamResponse, response, headers)
    response.end(body)
  })
}

function normalizeRoutePath (pathValue) {
  if (!pathValue) return ''
  if (/^https?:\/\//i.test(pathValue)) return pathValue
  return `/${String(pathValue).replace(/^\/+/, '')}`.replace(/\/{2,}/g, '/')
}

function sanitizeMenuResponse (body) {
  const payload = JSON.parse(body.toString('utf8'))
  if (!Array.isArray(payload.res)) return body

  const items = payload.res
  const childrenByParent = new Map()
  const pathById = new Map()

  items.forEach(item => {
    const children = childrenByParent.get(item.parentId) || []
    children.push(item)
    childrenByParent.set(item.parentId, children)
  })

  function buildPaths (parentId, parentPath) {
    const children = childrenByParent.get(parentId) || []
    children.forEach(item => {
      const sourcePath = item.path || item.key || item.name || ''
      const routePath = /^https?:\/\//i.test(sourcePath)
        ? sourcePath
        : normalizeRoutePath(`${parentPath}/${sourcePath}`)

      item.path = routePath
      pathById.set(item.id, routePath)
      buildPaths(item.id, routePath)
    })
  }

  buildPaths('0', '')

  items.forEach(item => {
    if (!item.redirect) return

    const redirect = String(item.redirect).trim()
    if (!redirect) return

    if (/^https?:\/\//i.test(redirect)) {
      item.redirect = redirect
      return
    }

    if (redirect.startsWith('/')) {
      item.redirect = normalizeRoutePath(redirect)
    } else {
      const children = childrenByParent.get(item.id) || []
      const child = children.find(candidate => {
        return candidate.key === redirect ||
          candidate.name === redirect ||
          candidate.path === redirect ||
          candidate.path === normalizeRoutePath(`${pathById.get(item.id)}/${redirect}`)
      })

      item.redirect = child
        ? pathById.get(child.id)
        : normalizeRoutePath(redirect.includes('/') ? redirect : `${pathById.get(item.id)}/${redirect}`)
    }

    if (item.redirect === pathById.get(item.id)) {
      const firstChild = (childrenByParent.get(item.id) || [])[0]
      if (firstChild) {
        item.redirect = pathById.get(firstChild.id)
      } else {
        delete item.redirect
      }
    }
  })

  return JSON.stringify(payload)
}

async function proxyHttpsRequest (request, response, upstreamHost, requestPath, options = {}) {
  let address
  try {
    address = await resolve4(upstreamHost)
  } catch (error) {
    if (options.fallback && options.fallback()) return
    response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(`DNS resolve failed for ${upstreamHost}: ${error.message}`)
    return
  }

  const headers = {
    ...stripHopByHopHeaders(request.headers),
    host: upstreamHost
  }
  if (options.transformResponse) headers['accept-encoding'] = 'identity'

  const upstream = https.request({
    hostname: address,
    port: 443,
    method: request.method,
    path: requestPath,
    servername: upstreamHost,
    ...(options.requestOptions || {}),
    headers
  }, upstreamResponse => {
    sendProxyResponse(upstreamResponse, response, options)
  })

  upstream.on('error', error => {
    if (options.fallback && !response.headersSent && options.fallback()) return
    if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(`Proxy request failed: ${error.message}`)
  })

  upstream.setTimeout(options.timeout || 15000, () => {
    upstream.destroy(new Error(`Upstream timeout after ${options.timeout || 15000}ms`))
  })

  request.pipe(upstream)
}

function proxyHttpRequest (request, response, upstreamHost, upstreamPort, requestPath, options = {}) {
  const headers = {
    ...stripHopByHopHeaders(request.headers),
    host: `${upstreamHost}:${upstreamPort}`
  }
  if (options.transformResponse) headers['accept-encoding'] = 'identity'

  const upstream = http.request({
    hostname: upstreamHost,
    port: upstreamPort,
    method: request.method,
    path: requestPath,
    headers
  }, upstreamResponse => {
    sendProxyResponse(upstreamResponse, response, options)
  })

  upstream.on('error', error => {
    if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(`Local tunnel request failed: ${error.message}`)
  })

  upstream.setTimeout(options.timeout || 30000, () => {
    upstream.destroy(new Error(`Local tunnel timeout after ${options.timeout || 30000}ms`))
  })

  request.pipe(upstream)
}

function isRootBcmAsset (pathname) {
  return [
    '/assets/',
    '/css/',
    '/img/',
    '/js/',
    '/tinymce/'
  ].some(prefix => pathname.startsWith(prefix)) || [
    '/apps.png',
    '/apps.svg',
    '/avatar2.jpg',
    '/default_file.png',
    '/favicon.ico',
    '/logo.png',
    '/logo备份.png',
    '/tk.jpg',
    '/tk.png'
  ].some(file => pathname.startsWith(file))
}

function sendShell (response) {
  const body = Buffer.from(shellHtml())
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-cache, no-store, must-revalidate',
    'content-length': String(body.length)
  })
  response.end(body)
}

function sendBcmIndex (response) {
  const filePath = path.resolve(localDistRoot, 'index.html')
  if (!fs.existsSync(filePath)) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(`Missing local index.html: ${filePath}`)
    return
  }

  const body = Buffer.from(transformBcmIndexHtml(fs.readFileSync(filePath, 'utf8')))
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-cache, no-store, must-revalidate',
    'content-length': String(body.length),
    'x-bcm-transformed-index': 'true'
  })
  response.end(body)
}

function isPortOpen (targetHost, targetPort) {
  return new Promise(resolve => {
    const socket = net.connect({ host: targetHost, port: targetPort })
    socket.setTimeout(500)
    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.on('error', () => resolve(false))
  })
}

async function waitForPort (targetHost, targetPort, timeoutMs = 8000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await isPortOpen(targetHost, targetPort)) return true
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  return false
}

async function ensureTunnel () {
  if (apiProxyMode !== 'tunnel' || !autoTunnel) return
  if (await isPortOpen(backendTunnelHost, backendTunnelPort)) return

  if (!fs.existsSync(sshKeyPath)) {
    console.warn(`[bcm-shell] SSH key not found: ${sshKeyPath}`)
    return
  }

  sshTunnelProcess = spawn('ssh', [
    '-i', sshKeyPath,
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
    '-N',
    '-L', `${backendTunnelHost}:${backendTunnelPort}:127.0.0.1:39080`,
    `root@${backendHost}`
  ], {
    cwd: here,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  sshTunnelProcess.stdout.on('data', chunk => {
    process.stdout.write(`[bcm-shell:ssh] ${chunk}`)
  })
  sshTunnelProcess.stderr.on('data', chunk => {
    process.stderr.write(`[bcm-shell:ssh] ${chunk}`)
  })
  sshTunnelProcess.on('exit', code => {
    if (code !== 0 && code !== null) {
      console.warn(`[bcm-shell] SSH tunnel exited with code ${code}`)
    }
  })

  if (!await waitForPort(backendTunnelHost, backendTunnelPort)) {
    console.warn(`[bcm-shell] SSH tunnel did not open ${backendTunnelHost}:${backendTunnelPort}`)
  }
}

function handleStaticRequest (request, response, requestUrl, pathname) {
  const upstreamPath = pathname.startsWith('/bcm/') ? requestUrl : `/bcm${requestUrl}`

  if (staticMode === 'local' && serveLocalBcmFile(response, upstreamPath)) {
    return
  }

  proxyHttpsRequest(request, response, ossHost, upstreamPath, {
    fallback: () => serveLocalBcmFile(response, upstreamPath),
    timeout: 3500
  })
}

function handleApiRequest (request, response, requestUrl) {
  const upstreamPath = requestUrl.replace(/^\/api-gateway/, '') || '/'
  const transformResponse = upstreamPath.startsWith('/cms/menu/loadMenu')
    ? sanitizeMenuResponse
    : undefined

  if (apiProxyMode === 'gateway') {
    proxyHttpsRequest(request, response, apiHost, upstreamPath, {
      transformResponse,
      requestOptions: {
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.2'
      }
    })
  } else {
    proxyHttpRequest(request, response, backendTunnelHost, backendTunnelPort, upstreamPath, {
      transformResponse
    })
  }
}

function proxyUpgradeToTunnel (request, socket, head) {
  if (apiProxyMode !== 'tunnel' || !request.url?.startsWith('/api-gateway/')) {
    socket.destroy()
    return
  }

  const upstreamPath = request.url.replace(/^\/api-gateway/, '') || '/'
  const upstream = net.connect(backendTunnelPort, backendTunnelHost, () => {
    const headers = {
      ...request.headers,
      host: `${backendTunnelHost}:${backendTunnelPort}`
    }
    const lines = [`${request.method} ${upstreamPath} HTTP/${request.httpVersion}`]
    Object.entries(headers).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(item => lines.push(`${key}: ${item}`))
      } else if (value !== undefined) {
        lines.push(`${key}: ${value}`)
      }
    })
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`)
    if (head.length) upstream.write(head)
    upstream.pipe(socket)
    socket.pipe(upstream)
  })

  upstream.on('error', () => socket.destroy())
}

await ensureTunnel()

const server = http.createServer((request, response) => {
  const parsed = new URL(request.url || '/', `http://${request.headers.host || `${host}:${port}`}`)
  const requestUrl = parsed.pathname + parsed.search

  if (parsed.pathname === '/' || parsed.pathname === '/index.html') {
    sendBcmIndex(response)
    return
  }

  if (parsed.pathname === '/shell') {
    sendShell(response)
    return
  }

  if (parsed.pathname.startsWith('/api-gateway/')) {
    handleApiRequest(request, response, requestUrl)
    return
  }

  if (parsed.pathname.startsWith('/bcm/') || isRootBcmAsset(parsed.pathname)) {
    handleStaticRequest(request, response, requestUrl, parsed.pathname)
    return
  }

  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  response.end('Not found')
})

server.on('upgrade', proxyUpgradeToTunnel)

server.listen(port, host, () => {
  console.log(`[bcm-shell] http://${host}:${port}/`)
  console.log(`[bcm-shell] api proxy mode: ${apiProxyMode}`)
  if (apiProxyMode === 'tunnel') {
    console.log(`[bcm-shell] tunnel target: ${backendTunnelHost}:${backendTunnelPort}`)
  }
})

function shutdown () {
  server.close(() => process.exit(0))
  if (sshTunnelProcess) sshTunnelProcess.kill()
  setTimeout(() => process.exit(0), 1000).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

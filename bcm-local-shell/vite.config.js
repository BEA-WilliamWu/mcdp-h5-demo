import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dns from 'node:dns'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'

const ossHost = 'bcm-pub.oss-cn-hongkong.aliyuncs.com'
const apiHost = 'c86e660649a94346bb9d00a9e621da5d-cn-hongkong.alicloudapi.com'
const backendTunnelHost = '127.0.0.1'
const backendTunnelPort = 39081
const apiProxyMode = process.env.BCM_API_PROXY_MODE || 'tunnel'
const localDistRoot = path.resolve(process.cwd(), '../beacms-vue-v251203/dist')
const staticAddressByHost = {
  [ossHost]: '47.79.64.231',
  [apiHost]: '8.210.102.171'
}

const resolver = new dns.Resolver()
const dnsCache = new Map()
let ossOfflineUntil = 0
resolver.setServers(['8.8.8.8', '1.1.1.1'])

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
  delete nextHeaders['upgrade']
  delete nextHeaders.origin
  return nextHeaders
}

function contentTypeFor (filePath) {
  const extname = path.extname(filePath).toLowerCase()
  const types = {
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
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

function serveLocalBcmFile (request, response, overrideUrl) {
  const parsed = new URL(overrideUrl || request.url || '/', 'http://127.0.0.1')
  let relativePath = parsed.pathname.replace(/^\/bcm\/?/, '')
  if (!relativePath || relativePath.endsWith('/')) relativePath += 'index.html'

  const filePath = path.resolve(localDistRoot, relativePath)
  if (!filePath.startsWith(localDistRoot + path.sep)) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Forbidden')
    return true
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not found')
    return true
  }

  response.writeHead(200, {
    'content-type': contentTypeFor(filePath),
    'cache-control': filePath.endsWith('index.html')
      ? 'no-cache, no-store, must-revalidate'
      : 'public, max-age=31536000, immutable',
    'x-bcm-local-fallback': 'true'
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
      const transformed = options.transformResponse(body, upstreamResponse)
      if (transformed) {
        body = Buffer.isBuffer(transformed) ? transformed : Buffer.from(String(transformed))
        delete headers['transfer-encoding']
        headers['content-length'] = String(body.length)
      }
    } catch (error) {
      body = Buffer.from(`Proxy response transform failed: ${error.message}`)
      headers['content-type'] = 'text/plain; charset=utf-8'
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
        : normalizeRoutePath(String(sourcePath).startsWith('/')
          ? sourcePath
          : `${parentPath}/${sourcePath}`)

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

async function proxyHttpsRequest (request, response, host, path, options = {}) {
  let address

  try {
    address = await resolve4(host)
  } catch (error) {
    if (options.fallback && options.fallback(request, response)) return

    response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(`DNS resolve failed for ${host}: ${error.message}`)
    return
  }

  const upstream = https.request({
    hostname: address,
    port: 443,
    method: request.method,
    path,
    servername: host,
    ...(options.requestOptions || {}),
    headers: {
      ...stripHopByHopHeaders(request.headers),
      host
    }
  }, upstreamResponse => {
    sendProxyResponse(upstreamResponse, response, options)
  })

  upstream.on('error', error => {
    if (options.fallback && !response.headersSent && options.fallback(request, response)) return

    if (!response.headersSent) {
      response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    }
    response.end(`Proxy request failed: ${error.message}`)
  })

  upstream.setTimeout(options.timeout || 15000, () => {
    upstream.destroy(new Error(`Upstream timeout after ${options.timeout || 15000}ms`))
  })

  request.pipe(upstream)
}

function proxyHttpRequest (request, response, host, port, requestPath, options = {}) {
  const upstream = http.request({
    hostname: host,
    port,
    method: request.method,
    path: requestPath,
    headers: {
      ...stripHopByHopHeaders(request.headers),
      host: `${host}:${port}`
    }
  }, upstreamResponse => {
    sendProxyResponse(upstreamResponse, response, options)
  })

  upstream.on('error', error => {
    if (!response.headersSent) {
      response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    }
    response.end(`Local tunnel request failed: ${error.message}`)
  })

  upstream.setTimeout(options.timeout || 30000, () => {
    upstream.destroy(new Error(`Local tunnel timeout after ${options.timeout || 30000}ms`))
  })

  request.pipe(upstream)
}

function bcmProxyPlugin () {
  return {
    name: 'bcm-local-proxy',
    configureServer (server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url || '/'
        const isRootBcmAsset = [
          '/assets/',
          '/css/',
          '/img/',
          '/js/',
          '/tinymce/'
        ].some(prefix => url.startsWith(prefix)) || [
          '/apps.png',
          '/apps.svg',
          '/avatar2.jpg',
          '/default_file.png',
          '/logo.png',
          '/logo备份.png',
          '/tk.jpg',
          '/tk.png'
        ].some(file => url.startsWith(file))

        if (url.startsWith('/bcm/') || isRootBcmAsset) {
          const upstreamPath = url.startsWith('/bcm/') ? url : `/bcm${url}`

          if (Date.now() < ossOfflineUntil) {
            serveLocalBcmFile(request, response, upstreamPath)
            return
          }

          proxyHttpsRequest(request, response, ossHost, upstreamPath, {
            fallback: (fallbackRequest, fallbackResponse) => {
              ossOfflineUntil = Date.now() + 60 * 1000
              return serveLocalBcmFile(fallbackRequest, fallbackResponse, upstreamPath)
            },
            timeout: 3500
          })
          return
        }

        if (url.startsWith('/api-gateway/')) {
          const upstreamPath = url.replace(/^\/api-gateway/, '') || '/'
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
          return
        }

        next()
      })
    }
  }
}

export default defineConfig({
  plugins: [
    vue(),
    bcmProxyPlugin()
  ],
  server: {
    host: '127.0.0.1',
    port: 5173
  }
})

import { createServer } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { handleDashboardApi, shutdownDashboard } from './dashboard-api.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const staticDirectory = path.join(projectRoot, 'dist-dashboard')
const host = process.env.DASHBOARD_HOST || '127.0.0.1'
const port = Number(process.env.DASHBOARD_PORT || 4173)
const basicAuthUser = process.env.DASHBOARD_BASIC_AUTH_USER || ''
const basicAuthPassword = process.env.DASHBOARD_BASIC_AUTH_PASSWORD || ''

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
])

function fail(message) {
  process.stderr.write(`[管理界面] ${message}\n`)
  process.exitCode = 1
}

function sameText(left, right) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function isAuthorized(request) {
  const authorization = request.headers.authorization || ''
  if (!authorization.startsWith('Basic ')) return false
  const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8')
  const divider = decoded.indexOf(':')
  if (divider < 0) return false
  return sameText(decoded.slice(0, divider), basicAuthUser)
    && sameText(decoded.slice(divider + 1), basicAuthPassword)
}

function setSecurityHeaders(response) {
  response.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'self'; frame-ancestors 'none'")
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
}

function sendUnauthorized(response) {
  response.statusCode = 401
  response.setHeader('WWW-Authenticate', 'Basic realm="XDDQ Dashboard", charset="UTF-8"')
  response.setHeader('Content-Type', 'text/plain; charset=utf-8')
  response.end('需要管理访问凭据')
}

function safeAssetPath(pathname) {
  let decodedPath
  try {
    decodedPath = decodeURIComponent(pathname)
  } catch {
    return null
  }
  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^[/\\]+/, '')
  const candidate = path.resolve(staticDirectory, relativePath)
  return candidate === staticDirectory || candidate.startsWith(`${staticDirectory}${path.sep}`) ? candidate : null
}

function sendStaticFile(request, response, pathname) {
  let assetPath = safeAssetPath(pathname)
  const isFile = assetPath && existsSync(assetPath) && statSync(assetPath).isFile()
  if (!isFile) assetPath = path.join(staticDirectory, 'index.html')

  if (!existsSync(assetPath)) {
    response.statusCode = 503
    response.setHeader('Content-Type', 'text/plain; charset=utf-8')
    response.end('管理界面尚未构建，请重新构建部署镜像')
    return
  }

  response.statusCode = 200
  response.setHeader('Content-Type', contentTypes.get(path.extname(assetPath).toLowerCase()) || 'application/octet-stream')
  response.setHeader('Cache-Control', assetPath.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable')
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  createReadStream(assetPath).pipe(response)
}

async function handleRequest(request, response) {
  setSecurityHeaders(response)
  if (!isAuthorized(request)) {
    sendUnauthorized(response)
    return
  }

  const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname
  if (pathname.startsWith('/api/')) {
    await handleDashboardApi(request, response, pathname)
    return
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.statusCode = 405
    response.setHeader('Allow', 'GET, HEAD')
    response.end()
    return
  }
  sendStaticFile(request, response, pathname)
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  fail('DASHBOARD_PORT 必须是 1 到 65535 之间的整数')
} else if (!basicAuthUser || !basicAuthPassword) {
  fail('生产服务必须设置 DASHBOARD_BASIC_AUTH_USER 和 DASHBOARD_BASIC_AUTH_PASSWORD')
} else {
  const server = createServer((request, response) => {
    void handleRequest(request, response).catch(error => {
      if (response.writableEnded) return
      response.statusCode = error instanceof SyntaxError ? 400 : error?.statusCode || 500
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.end(JSON.stringify({ error: error instanceof SyntaxError ? '请求内容不是有效 JSON' : error?.message || '服务处理失败' }))
    })
  })

  const stop = () => server.close(() => {
    shutdownDashboard()
    process.exit(0)
  })
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  server.listen(port, host, () => {
    process.stdout.write(`[管理界面] 正在监听 http://${host}:${port}\n`)
  })
}

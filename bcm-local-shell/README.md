# BCM Local Shell

本地外壳页，用 Node 代理 BCM CMS 前端和 API。

```bash
node server.mjs
```

打开 `http://127.0.0.1:5175/`。

`server.mjs` 默认会自动启动 SSH 隧道：

- `127.0.0.1:39081 -> 8.210.128.44:127.0.0.1:39080`
- 需要使用 `../deploy/mpaas-bff-ecs.pem`

实现方式：

- `/bcm/*` 默认读取本地 `../beacms-vue-v251203/dist`，本地文件不存在时再代理 OSS，并删除 `Content-Disposition` / `x-oss-force-download`。
- `/api-gateway/*` 默认代理到本地 SSH 隧道 `127.0.0.1:39081`，再进入 ECS 内部的 `127.0.0.1:39080`，避免 API Gateway 429 限流。
- 页面先拉取 `/bcm/index.html`，注入 `<base href="/bcm/">`，再通过 `iframe.srcdoc` 渲染。
- 注入运行时补丁，把前端内的 API Gateway 请求改成本地 `/api-gateway/*` 代理，避免本地调试时遇到 CORS。
- `/cms/menu/loadMenu` 会在本地代理层修正后端菜单里的相对 `redirect`，避免 vue-router 爆栈。

如果已有手动 SSH 隧道，或不希望 Node 自动启动隧道：

```bash
BCM_AUTO_TUNNEL=0 node server.mjs
```

如果要临时切回 API Gateway 代理：

```bash
BCM_API_PROXY_MODE=gateway node server.mjs
```

Vite 备用启动方式：

```bash
npm run dev
```

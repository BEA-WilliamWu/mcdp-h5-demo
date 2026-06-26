# BCM Local Shell

本地外壳页，用 Vite 代理 OSS 上的 BCM CMS 前端，并去掉 OSS 默认域名返回的下载头。

```bash
ssh -i ../deploy/mpaas-bff-ecs.pem \
  -N -L 127.0.0.1:39081:127.0.0.1:39080 \
  root@8.210.128.44
```

另开一个终端：

```bash
npm install
npm run dev
```

打开 `http://127.0.0.1:5173/`。

实现方式：

- `/bcm/*` 代理到 `https://bcm-pub.oss-cn-hongkong.aliyuncs.com/bcm/*`，并删除 `Content-Disposition` / `x-oss-force-download`。
- `/api-gateway/*` 默认代理到本地 SSH 隧道 `127.0.0.1:39081`，再进入 ECS 内部的 `127.0.0.1:39080`，避免 API Gateway 429 限流。
- 页面先拉取 `/bcm/index.html`，注入 `<base href="/bcm/">`，再通过 `iframe.srcdoc` 渲染。
- 注入运行时补丁，把前端内的 API Gateway 请求改成本地 `/api-gateway/*` 代理，避免本地调试时遇到 CORS。

如果要临时切回 API Gateway 代理：

```bash
BCM_API_PROXY_MODE=gateway npm run dev
```

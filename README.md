# MCDP WebSDK Vue H5 Demo

这个目录是一个 Vue 3 + Vite 的 mPaaS MCDP WebSDK 演示项目。页面本身只定义展位容器和展位码，不写死投放素材；轮播、公告、弹屏、浮标内容都由 WebSDK 请求 MCDP/MGS 后渲染。

## 运行

这个目录使用标准 `npm`，需要 Node.js 18 或以上版本。在 VSCode 打开 `mcdp-h5-demo` 后，直接在终端执行：

```bash
npm install
npm run build
npm run dev
```

开发地址：

```text
http://127.0.0.1:5177/
```

构建和本地预览：

```bash
npm run build
npm run preview
```

也可以在 VSCode 里运行任务：`Terminal > Run Task... > MCDP: dev` 或 `MCDP: build`。

## 项目结构

- `src/App.vue`：H5 页面、展位选择、配置抽屉、请求日志和渲染状态。
- `src/styles.css`：Vue demo 样式。
- `proxy/mcdpProxy.mjs`：本地 MCDP 代理，负责 `/mgw.htm` 加签和 `/mdap/*` 埋点转发。
- `vite.config.mjs`：Vite 开发服务和同源代理中间件。
- `server.mjs`：`dist` 预览服务，也复用同一套代理逻辑。
- `.env.example`：本地代理需要的环境变量模板。
- `.env.local`：本地真实密钥文件，已被 `.gitignore` 排除。
- `mcdpSDK使用说明.md`：阿里提供的 WebSDK 使用说明。

## 当前接入参数

前端默认配置：

```js
McdpView.init({
  appId: "ALIHK8DB6CA4171506",
  workspaceId: "default",
  tenantId: "KKSGIQRA",
  reportURL: "http://127.0.0.1:5177",
  uploadURL: "http://127.0.0.1:5177/mdap",
  userId: "web-demo-user",
  utdid: "web-demo-browser"
});
```

真实网关地址由本地代理读取：

```text
MCDP_REPORT_URL=https://mgw.mpaas.cn-hongkong.aliyuncs.com/mgw.htm
MCDP_UPLOAD_URL=https://mdap.mpaas.cn-hongkong.aliyuncs.com
MCDP_TENANT_ID=KKSGIQRA
MCDP_APP_SECRET=本地填写，不提交到仓库
```

页面右上角的“配置参数”按钮可以查看和调整这些参数。App Secret 默认不放进前端配置；本地代理会在服务端用 `.env.local` 的 `MCDP_APP_SECRET` 给 MGS 请求签名。

## 内容来源

页面里只有 MCDP 挂载点：

```html
<section class="mcdp-view-wrap" data-mcdp-code="home_rotation"></section>
<section class="mcdp-view-wrap" data-mcdp-code="home_notice"></section>
<div class="mcdp-view-wrap" data-mcdp-code="popup_banner"></div>
<div class="mcdp-view-wrap" data-mcdp-code="floating_buoy"></div>
```

请求链路是：

1. WebSDK 扫描 `.mcdp-view-wrap[data-mcdp-code]`。
2. WebSDK POST 到 `${reportURL}/mgw.htm` 请求活动数据。
3. Vite/Node 本地代理把请求转发到 `https://mgw.mpaas.cn-hongkong.aliyuncs.com/mgw.htm`。
4. 代理补齐 `tenantid` 并使用 App Secret 生成 `hmacsha256` 签名。
5. MGS 返回 `spaceInfoList`，WebSDK 将命中的活动素材渲染进对应展位。
6. WebSDK 通过 `${uploadURL}` 上报曝光、点击等埋点到 MDAP。

因此 demo 页显示的图片、公告文案、跳转链接都来自 MCDP 后台活动和素材配置，不来自本地 JSON 或 mock 数据。

## 当前后台活动

已验证命中的 MCDP 活动：

```text
活动单元：BCOPOC
活动名称：Web/H5真实展位演示
活动时间：2026-06-25 00:46:07 至 2026-06-26 00:46:08
人群：全量人群
状态：已上线
MGS result-status：1000
```

已创建的定向测试人群：

```text
人群名称：Web H5 Demo 用户
人群ID：W0260625212920
人群维度：用户ID
人群数：2
包含用户：web-demo-user、web-demo-browser
```

当前上线活动继续使用“全量人群”，这样任何本地浏览器都能稳定命中真实内容；如需演示定向投放，可以在后台把活动人群切到 `Web H5 Demo 用户`，demo 默认 `userId=web-demo-user` 仍会命中。

活动中已关联这些展位和素材：

```text
home_rotation    首页电子账单轮播图     https://www.bco.com.hk/h5/e-statement
home_notice      跨境消费周末返现公告   https://www.bco.com.hk/h5/cross-border-offers
popup_banner     首页理财升级弹屏       https://www.bco.com.hk/h5/wealth-upgrade
floating_buoy    优惠入口浮标           https://www.bco.com.hk/h5/offers
```

当前页面加载后，`/mgw.htm` 会真实返回这些展位内容；状态面板会显示 MGS 状态、当前展位码、渲染结果和请求日志。

轮播展位支持多素材展示：如果 `home_rotation` 在 `/mgw.htm` 的 `spaceInfoList[].spaceObjectList` 中返回多条图片素材，页面会自动切成轮播模式，支持自动播放、左右切换和指示点。当前后台返回的 `home_rotation` 只有 1 条素材，并且展位 `displayMaxCount` 为 1，所以页面会显示“轮播素材 1 张”而不会用本地假数据补图。要演示真实轮播，需要在 MCDP 后台给同一个活动的 `home_rotation` 增加多张图片物料，并把该 Banner 展位的展示数量/广告位数量配置为大于 1。

## 场景和自定义分类

页面提供一个“场景分类”下拉：

```text
首页 Web/H5、活动营销页、支付结果页、贷款推荐、客服服务、自定义组合
```

选择场景会切换一组展位码；单独修改轮播、公告、弹屏或浮标展位码时，场景会自动变成“自定义组合”。注意这个下拉只改变页面请求的展位码，不代表前端保存任何投放内容。实际是否有内容，仍取决于 MCDP 后台是否有上线活动命中这些展位、人群和时间。

## 生产接入建议

- 不要把 App Secret 写入浏览器代码、HTML、构建产物或公开配置。
- 生产环境建议由业务后端或网关完成 MGS 加签，再把同源 `reportURL`、`uploadURL` 提供给 WebSDK。
- 如果要让 Web 端直连阿里域名，需要确认 CORS、域名白名单、加签/加密策略均允许浏览器访问。
- `encryptType`、`publicKey` 只在阿里侧开启请求加密时使用；当前本地 demo 只做 MGS 签名。

## 排查

- `window.McdpView` 不存在：SDK 脚本没有加载成功。
- MGS 返回 `7014`：请求没有有效签名，检查 `.env.local` 的 `MCDP_APP_SECRET` 和代理是否启用。
- MGS 返回 `7003`：时间戳或签名头格式不符合 MGS 校验，确认代理只发送小写 `ts/sign/signtype/tenantid`。
- `/mgw.htm` 成功但页面无内容：检查展位码、活动状态、活动时间、人群规则、素材状态和投放策略。
- 曝光/点击无统计：检查 `/mdap/*` 是否成功转发到 `MCDP_UPLOAD_URL`。

### Windows 上 `/mgw.htm` 返回 500

`/mgw.htm` 是本地 Node 代理转发到阿里 MGS 的接口。500 通常表示 Node 进程没有成功连到 `https://mgw.mpaas.cn-hongkong.aliyuncs.com/mgw.htm`，常见原因是 Node 版本低于 18、BEA 内网阻断外网、公司代理未配置给 Node、或公司根证书没有加入 Node 信任链。

先打开：

```text
http://localhost:5177/api/mcdp-proxy-status
http://localhost:5177/api/mcdp-connection-test
```

再在 PowerShell 执行：

```powershell
node -v
node -e "console.log(typeof fetch)"
curl.exe -I https://mgw.mpaas.cn-hongkong.aliyuncs.com/mgw.htm
curl.exe -I https://mdap.mpaas.cn-hongkong.aliyuncs.com
```

判断方式：

- `fetch` 不是 `function`：Node 版本太低，换 Node.js 18 或以上。
- `api/mcdp-proxy-status` 里 `proxySigning=false`：没有复制 `.env.local`，或没有设置 `MCDP_APP_SECRET`。
- `curl.exe` 也连不上阿里域名：需要 BEA 网络放通或配置公司代理。
- `curl.exe` 能连，但 Node 报证书错误：需要用 `NODE_EXTRA_CA_CERTS` 指向公司根证书文件。

如果 BEA 内网必须走 HTTP 代理，可以先在启动服务的同一个 PowerShell 里设置代理，再启动：

```powershell
$env:HTTPS_PROXY="http://proxy-host:proxy-port"
$env:HTTP_PROXY="http://proxy-host:proxy-port"
node server.mjs
```

如果代理需要账号密码：

```powershell
$env:HTTPS_PROXY="http://username:password@proxy-host:proxy-port"
node server.mjs
```

启动后再次打开 `http://localhost:5177/api/mcdp-proxy-status`，确认 `httpsProxyConfigured=true`，再打开 `http://localhost:5177/api/mcdp-connection-test`，确认 `success=true`。

# 开发说明

面向维护者。用户视角的介绍见 [README.md](../README.md)。

## 架构

- 前端：Astro 静态多页（每个工具一页，利于搜索索引），交互用原生 TypeScript，无 UI 框架。
- 后端：Cloudflare Pages Functions，位于 `functions/`，只承担「必须由服务端发起」的查询。
- 运行时可降级：Functions 缺席（纯静态部署、`astro dev`）时，页面会回退到带 CORS 的第三方接口或提示不可用，不会整页崩溃。

```
src/pages/*.astro     页面 + 内联 <script>（Astro 会打包并 TS 化）
src/scripts/lib.ts    DOM 小工具、fetch 包装、格式化
src/scripts/network.ts 出口识别（/api/me → /cdn-cgi/trace 降级）与 IPv6 探测
src/layouts/          共享布局、导航、主题切换
src/styles/global.css 设计令牌与组件样式
shared/               前后端共用的纯逻辑（无 DOM、无 fetch）
functions/api/*.ts    每个端点一个文件，文件路径即路由
functions/_lib/       响应封装、边缘缓存、上游请求
tests/                node:test 单元测试（.mjs 直接导入 .ts）
```

## 端点

| 路由 | 方法 | 说明 | 缓存 |
| --- | --- | --- | --- |
| `/api/me` | GET | 出口 IP 与 `request.cf` 子集 | 不缓存 |
| `/api/headers` | GET | 请求头回显 + 连接信息 | 不缓存 |
| `/api/dns` | GET | 多解析器 DoH 并行查询，`name` 或 `ip`（PTR）+ `type` + `resolvers` | 60s |
| `/api/ip` | GET | 任意 IP 的归属与 ASN（ipwho.is → ipinfo.io） | 6h |
| `/api/rdap` | GET | RDAP 注册信息，`ip` 或 `domain` | 6h |
| `/api/cert` | GET | crt.sh 的 CT 日志摘要 | 1h |
| `/api/tor` | GET | Tor 出口列表成员判定 | 1h（列表本身） |
| `/api/port` | GET/POST | TCP 端口探测，仅公网目标，单次最多 8 个端口 | 不缓存 |

`/api/port` 使用 `cloudflare:sockets` 发起真实 TCP 握手。**没有 ICMP、没有 UDP**，所以不存在 ping/traceroute。

## 本地开发

```bash
pnpm install
pnpm dev                     # 只跑前端，/api/* 会 404，页面走降级路径
pnpm build && pnpm preview   # 完整栈：wrangler pages dev，含 Functions
```

`pnpm preview` 默认监听 `http://localhost:8788`。首次安装需要允许 esbuild / workerd / sharp 执行安装脚本（见 `pnpm-workspace.yaml` 的 `allowBuilds`）。

## 测试与检查

```bash
pnpm test    # node:test，覆盖 IP 判定、反向域名、DoH JSON 解析、域名校验
pnpm check   # astro check（含 functions 与 shared 的类型检查）
pnpm build
```

## 若干实现取舍

- **网络失败文案归一化**：本地 workerd 与边缘节点对连接失败返回的错误文案不同（`internal error; reference = ...`），`messageOf()` 统一成「上游不可达或连接被重置」，避免把平台内部错误暴露给用户。
- **`socket.close()` 不 await**：对未打开的 socket 调用 `close()` 可能永不 settle，会拖住整个探测请求；改用 fire-and-forget。
- **端口探测黑名单**：拒绝私有 / 保留地址、`localhost`、`.local` / `.internal` / `.home.arpa` 等后缀；Workers 本身也到不了内网，属于纵深防御。
- **不落 IP**：所有缓存键只含查询目标；`/api/me` 与 `/api/headers` 明确 `no-store`。
- **CSS 主题**：`data-theme` 在 `<head>` 内联脚本里先落定，避免首屏闪烁；`:root[data-theme="light"] .btn:not(.btn--ghost)` 控制浅色下按钮文字对比度。
- **依赖构建脚本**：pnpm 11 把 `onlyBuiltDependencies` 移到 `pnpm-workspace.yaml` 的 `allowBuilds`，否则 `pnpm exec` 会因为「Ignored build scripts」直接失败。

## 部署注意

- `wrangler.toml` 里 `pages_build_output_dir = "dist"`，直接 `wrangler pages deploy` 即可。
- 若在 Dashboard 用 Git 集成，构建命令 `pnpm build`，输出目录 `dist`。
- 可选环境变量：`IPINFO_TOKEN`（提高 ipinfo 备用配额）。
- 免费额度：Workers / Functions 10 万请求/天；静态资源不计入。`/api/tor` 会拉取约 1MB 的出口列表，靠 Cache API 每小时一次。
- 若部署在其它平台（Vercel、EdgeOne、纯静态），前端仍完整可用，但端口探测、证书、RDAP、请求头回显会失效或降级。

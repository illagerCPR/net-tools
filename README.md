# net-tools

一组安静的网络检测工具：看清你所在的网络。

线上地址：<https://net-tools.illageraris.dpdns.org>

不记录访问者 IP，不投放广告，不接入第三方分析。

## 功能

| 工具 | 能做什么 |
| --- | --- |
| **我的网络** | 出口 IP、归属地、ASN、运营商、时区、边缘节点、HTTP/TLS 版本、TCP 握手耗时 |
| **IP 查询** | 地址类型判定（公网 / 私有 / CGNAT / 回环 / 文档段…）、归属与 ASN、反向解析 PTR、RDAP 注册信息、Tor 出口判定 |
| **DNS 查询** | A / AAAA / CNAME / MX / TXT / NS / CAA / HTTPS 等记录，同时向阿里、Cloudflare、Google、AdGuard 发起查询并对比结果，标注 DNSSEC（AD）状态；也可以临时加上自己的 DoH 端点 |
| **DNS 泄漏检测** | 把出口、ECS 回显、浏览器时区与语言、WebRTC 候选、多解析器结果放在一起做启发式对照 |
| **请求头与 TLS** | 边缘节点收到的请求头、连接使用的协议版本，以及浏览器公开的 Client Hints 等指纹面 |
| **TCP 端口探测** | 由边缘节点发起 TCP 握手，检查目标端口连通性与耗时 |
| **证书历史** | 查询 Certificate Transparency 日志中某个域名签发过的证书 |

## 隐私

- 不记录访问者 IP，不写自定义日志，不使用任何第三方统计。
- 只用 `localStorage` 记住明暗主题，以及你添加的自定义 DoH 地址（不会写进 URL）。
- 输入内网 / 保留地址时只在浏览器本地判定，不会发往任何外部服务。
- DNS、RDAP、证书、Tor 出口列表的结果会在边缘节点缓存一段时间，缓存键是查询目标，不包含访问者 IP。

## 自建部署

需要 Cloudflare 账号与 Node.js 18+。

```bash
pnpm install
pnpm build
pnpm exec wrangler pages deploy dist --project-name net-tools
```

部署后可在 Cloudflare Pages 绑定自定义域名。可选：在 Pages 的「环境变量」中加入 `IPINFO_TOKEN`，提高任意 IP 归属查询的备用配额。

## 已知边界

- 浏览器无法读取操作系统的 DNS、路由表、网卡配置，也不能发起 ICMP，因此没有 ping、traceroute 和真正意义上的 DNS 泄漏检测。
- 端口探测由边缘节点发起，反映的是边缘到目标的连通性；部分出站端口会被平台屏蔽。
- 自定义 DoH 同样由边缘节点发起：只接受证书可信、返回 JSON 的公网 https 端点，局域网 DNS、自签证书与 `IP:53` 都查不到。
- 证书页展示的是 CT 日志，不是当前服务端实际下发的证书链；归属库的城市级定位存在误差。

## 许可

MIT

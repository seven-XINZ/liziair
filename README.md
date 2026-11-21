# LIZI · 粒子播放器

用折射型玻璃引擎做的歌词演出器：**登录你自己的音乐平台账号**，拉真实歌单、真实歌词、真实播放地址。聚合网易云 / QQ / 酷狗 / 汽水 / 波点 / 酷我 / Spotify 等多路音源，自带可安装的 **PWA** 与锁屏媒体控制，另有 60 多种全屏歌词形态与一套可换的播放页皮肤。

![播放中](public/site/img/03-now-playing.png)

---

## 特性

- **多音源聚合**：主服务统一代理各音源边车，搜索、歌单、歌词、播放地址走同一套前端；登录态留在服务端，浏览器只拿资料不回 Cookie
- **形态系统**：60 多套全屏歌词演出（粒子、雪、铁屑、弹簧字……），发布清单只列真实构建过的页面，未构建的自动隐藏或回一张「施工中」占位页
- **播放页两态**：收起时封面居中 + 3 行歌词预览；拉起后封面缩到左侧、歌词面板从右侧展开，同一条 CSS 过渡完成
- **歌词动画**：经典 / 聚焦 / 上浮三套可切，支持 YRC 逐字与 LRC 逐行，含翻译行
- **节拍检测**：BPM 优先取上游歌曲百科元数据，缺失时退回实时音频检测；封面跟拍脉动
- **播放控制**：队列、上一首/下一首、顺序 / 单曲循环 / 随机，空格键暂停，进度与音量可拖拽
- **PWA**：自带 manifest 与 Service Worker，可装到主屏；页面与 JS 网络优先（改完刷新即生效），图片字体缓存优先且有条数上限
- **锁屏媒体控制**：Media Session 上报歌名、歌手、封面、进度；iOS 上显式注销快进快退，保留上下曲

---

## 快速开始

```powershell
node server.mjs        # 或双击 start.cmd
```

端口默认自动分配（写入 `.port`，重启沿用）。固定端口：`$env:PORT=8080; node server.mjs`。
要求 Node 18+；**网页版服务端零 npm 依赖**，`npm install` 只用于桌面版打包。

### Docker

```bash
docker compose up -d --build
```

多阶段单容器：代码在只读镜像层，登录态与边车凭证落 `/data` 卷，重建容器不丢。镜像约 **371MB**（`node:24-slim` 基座 + 5 个边车依赖）。完整说明与反代示例见 [docker/README.md](docker/README.md)。

### 环境变量

| 变量 | 说明 | 默认 |
|---|---|---|
| `HOST` | 监听地址；容器内需 `0.0.0.0` | `127.0.0.1` |
| `PORT` | 监听端口；不设则沿用 `.port` 或系统分配 | 自动 |
| `TZ` | 时区 | `Asia/Shanghai` |
| `LIZI_DATA_DIR` | 主服务状态目录（`.session.json` / `.port` / `.access-key`） | 代码目录 |
| `LIZI_SERVICES_DIR` | 边车可写副本目录 | `services/` |
| `LIZI_ACCESS_KEY` | 可选对接密钥；留空则不启用设备配对 | 空 |
| `LIZI_NODE_BIN` | 拉起边车所用 node | `node` |

---

## 音源与登录

入口在 **设置页 → 平台账号**，一家一行一个「登录」，没有账号密码表单。

| 平台 | 边车 | 登录方式 / 备注 |
|---|---|---|
| **网易云** | `services/netease-api` | App 扫码；被风控时可在同弹窗粘贴 `MUSIC_U` |
| **QQ 音乐** | `services/qq-api` | QQ / 微信 / QQ 音乐扫码，koa + MQTT |
| **酷狗** | `services/kugou-api` | App 扫码；未登录能搜，播放会被风控拦 |
| **汽水** | `services/qishui-api` | 抖音扫码；未登录 30 秒试听，边车需 Node ≥ 24 |
| **波点** | `services/bodian-api` | 扫码；未登录 30 秒试听，播放限中国大陆网络 |
| **酷我** | `services/kuwo-api` | 零依赖边车，只监听 `127.0.0.1`，按需拉起 |
| **Spotify** | `services/spotify-api` | PKCE 登录与元数据骨架，**不接音频** |

登录态全部落本机：网易云在主服务 `.session.json`，其余在各边车 `.auth-*`。浏览器里的「平台管理」只记住你勾选了哪几家（`localStorage`），保存后即时生效。

边车是**懒启动**的：第一次访问某平台时才拉起进程，所以 `/api/health/all` 里未用过的源显示 `idle` 而不是故障。

### 设备配对（可选）

给原生壳等外部客户端的对接通道，网页本身照常访问：

- `GET /api/pair/status` 是否启用密钥；`POST /api/pair` 带 `key` 换平台登录态汇总
- `GET /api/access-key` 查看；`POST /api/access-key/regenerate` 重生成（环境变量来源返回 409）
- 密钥来自 `LIZI_ACCESS_KEY` 或数据目录 `.access-key`，两者都空 = 不启用

---

## 形态系统

播放页顶栏的「形态」入口可以在几十套全屏歌词演出之间即时切换，选择记在 `localStorage`。

- **登记表**：`app.js` 里 `STAGES` 记录每个形态的 id / 名称 / 描述 / 页面地址，目前 658 条
- **发布清单**：`STAGE_RELEASE_ORDER` 决定普通用户看到的顺序与范围（69 条），开发者版（`?edition=dev`）可看全量
- **真实文件**：`public/stages/*.html`，每个页面独立自包含，通过 `postMessage` 与宿主交换 `init` / `tick` / `beat`
- **索引接口**：`GET /api/stages` 扫描目录返回真实存在的 id（60 秒缓存），前端据此过滤——清单里缺文件的条目不再出现在列表里
- **兜底页**：万一还是点到未构建的形态，`serveStatic` 会回 `stages/_not-built.html`（200 + 施工提示），而不是空白 404

新增一个形态：在 `public/stages/` 放一个自包含 html，把 id 加进 `STAGES` 与 `STAGE_RELEASE_ORDER`，无需改服务端——索引接口会自动发现它。

---

## 服务端接口

`server.mjs` 是零依赖 Node 服务，主要做四件事：协议代理、登录态管理、静态托管、健康检查。

| 接口 | 用途 |
|---|---|
| `GET /healthz` | 容器探活，不碰上游 |
| `GET /api/health/all` | 5 个音源边车的端口、延迟、登录态；懒启动的标 `idle` |
| `GET /api/stages` | 形态目录索引（真实存在的 html） |
| `GET /api/img` | 同源封面代理，绕开防盗链与 CORS；小额 LRU，24h / 96 条 / 32MB |
| `GET /api/platforms` | 各平台登录态汇总 |
| `GET /api/<src>/health` | 单个边车探活（`src` = netease / qq / kugou / qishui / bodian） |

静态响应统一带 `X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin`、`Permissions-Policy`（关传感器）、`Content-Security-Policy: frame-ancestors 'self'`；文本类按需 gzip（结果按 ETag 缓存），音视频支持单段 Range / 206。

`wallpaper-api.mjs` 另提供 Wallpaper Engine 壁纸元数据、视频字节流（Range）与预览图。

---

## 技术细节

**液态玻璃**：`public/assets/liquid-glass.js` + `.css` 两个零依赖文件，运行时按元素尺寸生成位移贴图，走 `feImage → feDisplacementMap(色散) → feColorMatrix → feBlend` 滤镜链，最后交给 `backdrop-filter: url(#id) blur() saturate()`。全站 17 个玻璃表面，三种挂法（声明式 `lg-surface`、顶栏/播放条的 bare 模式、视图切换后的 `LiquidGlass.refresh()`）。背景光斑用 `radial-gradient`，不用大尺寸 `filter: blur()` 动画。

**播放页过渡**：两个状态共用一条 `grid-template-columns` 从 `min(0fr)` 到 `minmax(0, 1fr)` 的插值，封面的左移缩小与面板展开天然同步，不用 JS 逐帧算位置。

**节拍检测**：BPM 取歌曲百科 `SONG_PLAY_ABOUT_SONG_BASIC` 里的 `creativeType === 'bpm'`，约 1 秒出且无倍速歧义；相位用实时检测（频谱通量起音 + 自相关测速 + 拍相位轻推）。结果按歌曲 id 缓存 300 首。

**歌词**：YRC 逐字 / LRC 逐行，有 YRC 用 YRC。**YRC 只在登录后由上游下发**，匿名请求的 `yrc` 字段始终为空——这是平台策略，不是降级缺陷。

**演示音轨**：上游对大量歌曲返回 `url: null`，拿不到地址时用 WebAudio 现场合成 40 秒琶音（种子取歌曲 id），播放条打「演示音轨」角标，列表里 VIP 曲目提前标 `VIP`。

**搜索封面**：`/search/get` 只回 `album.picId`，无法拼出地址；采用先搜索再按 id 批量查 `song/detail`（每批 500）回填 `al.picUrl`。

**Service Worker**：`/api/*`、带 Range 的请求一律直连；页面与 js/css 网络优先；图片字体缓存优先，**320 条 / 单文件 3MB 上限**，超限淘汰最早四分之一。

---

## 目录结构

```
liziair/
├── server.mjs             零依赖主服务：协议代理 / 登录态 / 静态托管 / 封面缓存 / 配对
├── wallpaper-api.mjs      Wallpaper Engine 壁纸接口（元数据 / 视频流 Range / 预览）
├── Dockerfile             多阶段单容器镜像（上下文 = 仓库根）
├── docker-compose.yml     卷 /data、探活、日志与资源限制
├── docker-entrypoint.sh   按指纹同步边车到 /data，保留登录态
├── docker/                部署说明与 nginx 反代示例
├── services/              各音源边车（netease / qq / kugou / kuwo / qishui / bodian / spotify）
├── desktop/               Electron 主进程与预加载
├── release.mjs            发版脚本（打包 + Release + Android APK）
├── public/
│   ├── index.html         桌面版结构 + 内联 SVG 图标库
│   ├── m/index.html       移动版壳（`<base href="/">`，与桌面共用 app.js / app.css）
│   ├── m/phone.js|css     移动端专属交互与布局
│   ├── platforms-picker.js 设置页「平台管理」弹窗（读写 localStorage，零依赖）
│   ├── sw.js              Service Worker（含缓存配额）
│   ├── pwa.js             SW 注册 / 锁屏控制 / iOS 后台自愈
│   ├── tokens.css         设计令牌（字体 / 间距 / OKLCH 色板）
│   ├── fonts.css          自托管 @font-face，按 unicode-range 分片
│   ├── app.css / app.js   布局排版与 UI 装配（播放器 / 形态宿主 / 列表渲染）
│   ├── api.js / player.js 前端 API 层与播放引擎（队列 / 歌词 / 恢复阶梯）
│   ├── beat.js            节拍检测
│   ├── stages/            形态页面（69 个已构建 + `_not-built.html` 兜底）
│   ├── _legacy/m/         旧版移动端遗留（零引用，已归档，不进镜像）
│   └── assets/            液态玻璃引擎、PWA 图标、自托管字体
```

> `public/` 下另有 `lab/`、`*-lab.html`、`proto/`、`player-skins/` 等实验产物，不影响主流程。
> `public/site/`（官网静态页）与 `stages/assets` 里零引用的素材不进镜像，仓库中保留。

---

## 已知限制

- **折射与色散只有 Chromium 内核**支持；Safari / Firefox 落到纯 `blur()` 降级，功能不受影响
- 网易云二维码由公开的 `api.qrserver.com` 渲染，离线环境可改粘贴 `MUSIC_U`
- 封面取色必须走 `/api/img` 同源代理，否则 `<canvas>` 被污染
- **iOS 后台播放**绕开 Web Audio 由 `<audio>` 原生出声，代价是交叉淡化与实时频谱降级；standalone 模式在部分系统版本仍可能被挂起
- Spotify 边车只做登录骨架与元数据，不提供音频

---

## 桌面版与发版

```powershell
npm install
npm run dist                 # 只打包
npm run release -- v1.0.0    # 打包 + GitHub Release + Android APK
```

自动更新走 `electron-updater` + GitHub Releases；仓库信息在 `package.json` 的 `build.publish` 与 `desktop/main.js` 的 `GITHUB_OWNER` / `GITHUB_REPO`。完整流程见 [RELEASE.md](RELEASE.md)。

### 历史发行包

| 平台 | 文件 | 夸克 | 百度 |
|---|---|---|---|
| Windows | `LIZI-Setup-1.0.5.exe` | [下载](https://pan.quark.cn/s/6c6e65f3ee4c) | [下载](https://pan.baidu.com/s/1crtOz-RxF6YyKLn9uxykWQ?pwd=lizi) |
| Android | `LIZI-Android-1.0.5-arm64-v8a.apk` | [下载](https://pan.quark.cn/s/6c6e65f3ee4c) | [下载](https://pan.baidu.com/s/1crtOz-RxF6YyKLn9uxykWQ?pwd=lizi) |

手机装 `arm64-v8a`；安装包未签名，Windows SmartScreen 可能提示「未知发布者」。

---

## 法律与免责

本项目在 AI 辅助下开发，仍可能存在未发现的问题，使用前请自行评估。

只展示播放动效、界面设计与工程实现，不提供、不存储任何音乐内容；音频、歌词、封面等版权归对应权利人所有。仓库与源码仅供个人学习、技术交流与非营利测试，请勿商用。因使用本项目或传播第三方内容产生的纠纷与责任由使用者承担。

请尊重数字版权，条件允许时通过官方平台支持正版。

## 致谢

感谢提供思路与公开接口的社区项目、歌词库维护者，以及所有参与测试形态的朋友。

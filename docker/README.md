# Docker 部署

仓库根目录的 `Dockerfile` 把 LIZI 打成单容器镜像（多阶段构建）：主服务零 npm 依赖，各音源边车在 builder 阶段装好依赖后只把 `node_modules` 带进运行层。

## 架构要点

- **代码留在只读镜像层**，运行时状态落持久化卷 `/data`：
  - `LIZI_DATA_DIR=/data`：主服务登录态 `.session.json`、设备指纹 `.netease-device.json`、`.port`
  - `LIZI_SERVICES_DIR=/data/services`：边车可写副本（边车会写 `.port` / `.log` / `.auth-*`）
- entrypoint 按镜像内容指纹判断是否需要重新同步边车；内容没变时跳过同步、秒起。
- 运行层以非 root（`node` 用户）启动，`tini` 作 PID 1 回收边车僵尸进程；内置 `/healthz` 探活。

## 1. 构建镜像

在**仓库根目录**执行（上下文必须是根，`Dockerfile` 从这里拷贝 `public/`、`services/`、`server.mjs`、`wallpaper-api.mjs`）：

```bash
docker build -t liziair:latest .
```

国内默认走 npmmirror 镜像；海外构建可指定官方源：

```bash
docker build -t liziair:latest --build-arg NPM_REGISTRY=https://registry.npmjs.org .
```

## 2. 启动容器

### 方式一：docker compose（推荐）

仓库根已带 `docker-compose.yml`：

```bash
docker compose up -d --build
```

卷默认挂到 `./data:/data`，按需改成你 NAS 上的实际目录；首次使用先把该目录属主改为容器内运行用户：

```bash
chown -R 1000:1000 ./data
```

### 方式二：docker run

```bash
docker run -d \
  --name liziair \
  --restart unless-stopped \
  -p 8088:8088 \
  -v /opt/liziair/data:/data \
  -e HOST=0.0.0.0 \
  -e PORT=8088 \
  -e TZ=Asia/Shanghai \
  -e LIZI_DATA_DIR=/data \
  -e LIZI_SERVICES_DIR=/data/services \
  liziair:latest
```

| 项 | 说明 |
|---|---|
| `-p 8088:8088` | 宿主机端口映射，左侧可按需改 |
| `-v ...:/data` | 持久化卷：登录态、设备指纹、边车端口/日志/凭证都在卷内，重建容器不丢 |
| `HOST` / `PORT` | 监听地址与端口；`HOST=0.0.0.0` 允许容器外访问 |
| `TZ` | 时区，默认 `Asia/Shanghai` |
| `LIZI_DATA_DIR` | 主服务状态目录，默认 `/data` |
| `LIZI_SERVICES_DIR` | 边车可写副本目录，默认 `/data/services` |

## 3. 反代到域名

`docker/nginx/` 下是两份参考配置：

- `proxy.conf.example`：上游转发片段（`location` 块），把 `proxy_pass` 改成你的容器/宿主机地址与端口（默认 `127.0.0.1:8088`）。
- `site.conf.example`：HTTPS 站点模板，域名、证书路径、日志路径按自身环境替换。

容器直接监听 8088；需要 HTTPS / 域名时在前面挂一层 nginx 或 openresty 引用上面的片段即可。

## 4. 常用运维

```bash
# 查看日志
docker logs -f liziair

# 探活（镜像内置）
curl http://127.0.0.1:8088/healthz

# 升级：重新构建后重建容器（卷保留登录态与边车凭证）
docker build -t liziair:latest .
docker rm -f liziair
# 再执行上面的 compose up 或 docker run
```

> 从旧版（卷挂在 `/app`）升级：把原来挂到 `/app` 的宿主机目录改挂到 `/data` 即可，登录态与边车凭证原地保留。

## 5. 可选凭证

- **Spotify**：不预置第三方凭证，需在边车目录配置 `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` 环境变量，或放入该边车的 `.client.json`（该文件不入库）。
- 其它平台登录态在扫码后自动写入持久化卷，无需手工配置。

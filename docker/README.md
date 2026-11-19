# Docker 部署

仓库根目录的 `Dockerfile` 把 LIZI 打成单容器镜像：主服务零 npm 依赖，各音源边车在镜像内安装自己的依赖。

## 1. 构建镜像

在**仓库根目录**执行（上下文必须是根，`Dockerfile` 从这里拷贝 `public/`、`services/`、`server.mjs`、`wallpaper-api.mjs`）：

```bash
docker build -t liziair:latest .
```

## 2. 启动容器

```bash
docker run -d \
  --name liziair \
  --restart unless-stopped \
  -p 8088:8088 \
  -v /opt/liziair/data:/app \
  -e PORT=8088 \
  -e HOST=0.0.0.0 \
  -e TZ=Asia/Shanghai \
  liziair:latest
```

| 项 | 说明 |
|---|---|
| `-p 8088:8088` | 宿主机端口映射，左侧可按需改 |
| `-v ...:/app` | 持久化卷：登录态、设备指纹、边车端口与日志都在卷内，重建容器不丢 |
| `PORT` / `HOST` | 监听端口与地址；`HOST=0.0.0.0` 允许容器外访问 |
| `TZ` | 时区，默认 `Asia/Shanghai` |

> 首次启动会把镜像内初始源码与边车依赖拷入卷；之后每次启动用镜像内最新代码覆盖卷内源码目录，登录态等运行时文件属于卷内额外文件，不会被删除。

## 3. 反代到域名

`docker/nginx/` 下是两份参考配置：

- `lizi-proxy.conf`：上游转发片段（`location` 块），把 `proxy_pass` 改成你的容器/宿主机地址与端口。
- `lizi.xinz.fun.conf`：HTTPS 站点模板，域名、证书路径、日志路径按自身环境替换。

容器直接监听 8088；需要 HTTPS / 域名时在前面挂一层 nginx 或 openresty 引用上面的片段即可。

## 4. 常用运维

```bash
# 查看日志
docker logs -f liziair

# 升级：重新构建后重建容器（卷保留登录态）
docker build -t liziair:latest .
docker rm -f liziair
# 再执行上面的 docker run
```

## 5. 可选凭证

- **Spotify**：不预置第三方凭证，需在边车目录配置 `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` 环境变量，或放入该边车的 `.client.json`。
- 其它平台登录态在扫码后自动写入持久化卷，无需手工配置。

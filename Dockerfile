# syntax=docker/dockerfile:1
# ============================================================================
# LIZI 单容器镜像（多阶段）
#   docker build -t liziair:latest .
#
# 与旧版的关键差别：
#   1. 不再用 sed 去改 server.mjs 的监听地址 —— 源码已原生支持 HOST 环境变量，
#      构建期做断言，改不动就直接失败，而不是构建"成功"但容器绑回环、端口映射不通。
#   2. 代码留在只读镜像层，运行时状态落 /data 卷 —— 不再每次启动把 83MB 的 public/
#      拷进卷（旧版 entrypoint 每次重启都全量 cp，NAS 上尤其慢）。
#   3. 多阶段：边车依赖在 builder 装完并清掉 npm 缓存，只把 node_modules 带进运行层。
#   4. tini 作 PID 1 回收僵尸（主服务会 spawn 边车子进程）；非 root 运行；带 HEALTHCHECK。
# ============================================================================

ARG NODE_IMAGE=node:24-slim

# ---------- 阶段一：只装边车依赖 ----------
FROM ${NODE_IMAGE} AS deps
# 国内默认走 npmmirror；海外构建传 --build-arg NPM_REGISTRY=https://registry.npmjs.org
ARG NPM_REGISTRY=https://registry.npmmirror.com
WORKDIR /build
COPY services ./services
RUN set -eu; \
    failed=""; \
    for d in services/*/; do \
      if [ -f "$d/package.json" ]; then \
        echo "== npm install $d =="; \
        if (cd "$d" && npm install --omit=dev --no-audit --no-fund --registry="$NPM_REGISTRY"); then \
          :; \
        else \
          echo "WARN: $d 依赖安装失败，该音源运行时降级 502"; \
          failed="$failed $d"; \
        fi; \
      fi; \
    done; \
    printf '%s\n' "$failed" > /build/.sidecar-install-report; \
    npm cache clean --force >/dev/null 2>&1 || true; \
    rm -rf /root/.npm /tmp/* /build/services/*/.cache

# ---------- 阶段二：运行层 ----------
FROM ${NODE_IMAGE} AS runtime

ENV HOST=0.0.0.0 \
    PORT=8088 \
    TZ=Asia/Shanghai \
    NODE_ENV=production \
    LIZI_DATA_DIR=/data \
    LIZI_SERVICES_DIR=/data/services

# tzdata：slim 镜像不带时区库，只设 TZ 环境变量是不生效的（日志/边车时间会错）
# tini：node 作 PID 1 不回收僵尸进程，而本服务会拉起多个边车子进程
RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --chown 直接落成 node 属主，避免事后 chown -R 把 83MB 再复制一层
COPY --chown=node:node public ./public
COPY --chown=node:node server.mjs wallpaper-api.mjs ./
COPY --chown=node:node --from=deps /build/services ./services
COPY --chown=node:node --from=deps /build/.sidecar-install-report ./.sidecar-install-report
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# 构建期断言：监听地址必须已原生化。旧版靠 sed + grep 打印，替换失败也不会让构建失败。
RUN set -eu; \
    chmod +x /usr/local/bin/docker-entrypoint.sh; \
    grep -q "process.env.HOST" server.mjs \
      || { echo "FATAL: server.mjs 未支持 HOST 环境变量，容器将无法对外监听"; exit 1; }; \
    grep -q "LIZI_DATA_DIR" server.mjs \
      || { echo "FATAL: server.mjs 未支持 LIZI_DATA_DIR，状态无法落卷"; exit 1; }; \
    mkdir -p /data; chown node:node /data

# 镜像内容指纹：entrypoint 据此判断要不要重新同步边车到卷（内容没变就秒起）
RUN set -eu; \
    { cat server.mjs wallpaper-api.mjs; \
      find services -type f \( -name '*.mjs' -o -name 'package.json' \) -not -path '*/node_modules/*' \
        | LC_ALL=C sort | xargs cat; \
    } | sha256sum | cut -c1-16 > /app/.image-stamp; \
    chown node:node /app/.image-stamp

USER node
VOLUME ["/data"]
EXPOSE 8088

# 探活走 /healthz：不碰任何上游音源，纯本地判断
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8088)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.mjs"]

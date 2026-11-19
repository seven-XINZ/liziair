# LIZI 单容器镜像。构建上下文 = 仓库根目录：
#   docker build -t liziair:latest .
# 运行时把源码与边车依赖落在持久化卷 /app，登录态等运行时文件随卷保留。
FROM node:24-slim

WORKDIR /app-image

ENV HOST=0.0.0.0 \
    PORT=8088 \
    TZ=Asia/Shanghai \
    NODE_ENV=production

# 主服务零 npm 依赖；仅边车需要各自安装依赖
COPY public ./public
COPY services ./services
COPY server.mjs wallpaper-api.mjs ./

# 逐个安装有 dependencies 的边车；单个失败不阻断构建（对应音源运行时降级 502）
# 国内构建走 npmmirror 镜像；海外可去掉 --registry 参数改用官方源。
RUN set -e; \
    for d in services/*/; do \
      if [ -f "$d/package.json" ]; then \
        echo "== npm install $d =="; \
        (cd "$d" && npm install --omit=dev --no-audit --no-fund --registry=https://registry.npmmirror.com) \
          || echo "WARN: $d 依赖安装失败，该音源将不可用"; \
      fi; \
    done

# 主服务默认只绑 127.0.0.1，容器对外暴露需监听 0.0.0.0（可用 HOST 覆盖）
RUN sed -i "s/server.listen(PORT, '127.0.0.1'/server.listen(PORT, process.env.HOST || '0.0.0.0'/" server.mjs \
    && grep -n "server.listen(PORT" server.mjs

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# 登录态 / 边车端口与日志等运行时状态持久化到卷
VOLUME ["/app"]

EXPOSE 8088
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

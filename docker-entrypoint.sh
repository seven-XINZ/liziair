#!/bin/sh
set -e

# /app 为持久化卷。
# 首次启动：把镜像内初始源码与已装好的边车依赖整拷入卷。
# 之后每次启动：用镜像内最新代码/依赖覆盖源码目录，登录态(.session.json/.auth-*)、
# 设备指纹、边车 .port/.log 等运行时文件属于卷内额外文件，cp 不会删除，予以保留。
cd /app

if [ ! -f /app/.lizi_initialized ]; then
  echo "[entrypoint] 初始化持久化目录 /app"
  cp -rn /app-image/. /app/
  touch /app/.lizi_initialized
else
  echo "[entrypoint] 同步镜像内最新代码到持久化目录（保留登录态与日志）"
  cp -r /app-image/public/. /app/public/
  cp -r /app-image/services/. /app/services/
  cp -f /app-image/server.mjs /app-image/wallpaper-api.mjs /app/
fi

exec node server.mjs

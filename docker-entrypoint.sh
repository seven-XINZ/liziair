#!/bin/sh
# ============================================================================
# LIZI 容器入口
# ----------------------------------------------------------------------------
# 旧版每次启动都 `cp -r` 覆盖 public/(83MB) 和 services/(含 node_modules) 到卷里，
# 启动慢、NAS IO 大，而且只覆盖不删除，升级后旧文件一直残留。
#
# 新版：代码留在只读镜像层直接跑，卷里只放两类东西
#   1. 主服务状态：.session.json / .netease-device.json / .port（LIZI_DATA_DIR）
#   2. 边车目录副本：边车把 .port/.log/.auth-* 写在自己目录里，所以这份必须可写且持久
#      （LIZI_SERVICES_DIR）。只有镜像内容指纹变化时才同步，且同步时跳过所有状态文件。
#
# 从旧版升级：把原来挂到 /app 的那个宿主机目录改挂到 /data 即可，
# 旧卷里本来就是 services/<name>/.auth-* 和 .session.json 这套布局，登录态原地保留。
# ============================================================================
set -eu

DATA="${LIZI_DATA_DIR:-/data}"
SVC="${LIZI_SERVICES_DIR:-$DATA/services}"
IMAGE_SVC="/app/services"
STAMP_FILE="$DATA/.image-stamp"
IMAGE_STAMP="$(cat /app/.image-stamp 2>/dev/null || echo unknown)"

mkdir -p "$DATA" "$SVC" 2>/dev/null || {
  echo "[entrypoint] 致命：数据目录 $DATA 不可写。"
  echo "[entrypoint] 宿主机上执行： chown -R 1000:1000 <你挂载的目录>  后重启容器。"
  exit 1
}

if [ ! -w "$DATA" ]; then
  echo "[entrypoint] 致命：$DATA 无写权限（容器以 uid 1000 运行）。请在宿主机 chown -R 1000:1000 该目录。"
  exit 1
fi

need_sync=1
if [ -f "$STAMP_FILE" ] && [ "$(cat "$STAMP_FILE" 2>/dev/null)" = "$IMAGE_STAMP" ] && [ -d "$SVC" ]; then
  need_sync=0
fi

if [ "$need_sync" = "1" ]; then
  echo "[entrypoint] 同步边车到数据卷（镜像指纹 $IMAGE_STAMP）——只覆盖代码与依赖，保留登录态"
  for d in "$IMAGE_SVC"/*/; do
    [ -d "$d" ] || continue
    name="$(basename "$d")"
    mkdir -p "$SVC/$name"
    # 用 tar 管道复制（含 node_modules），排除一切运行时状态文件
    (cd "$d" && tar cf - \
        --exclude='./.port' \
        --exclude='./.log' \
        --exclude='./.log.*' \
        --exclude='./.auth-*' \
        --exclude='./.client.json' \
        --exclude='./.session.json' \
        --exclude='./.netease-device.json' \
        --exclude='./device.json' \
        --exclude='./cookie*.txt' \
        --exclude='./.cache' \
        .) | (cd "$SVC/$name" && tar xf -)
  done
  printf '%s' "$IMAGE_STAMP" > "$STAMP_FILE"
  echo "[entrypoint] 同步完成"
else
  echo "[entrypoint] 边车已是当前镜像版本，跳过同步（秒起）"
fi

# 装依赖时失败过的边车在这里提示一次，避免"构建成功但某个音源一直 502"查不到原因
if [ -s /app/.sidecar-install-report ]; then
  echo "[entrypoint] 注意：以下边车在构建期依赖安装失败，对应音源会降级 502："
  cat /app/.sidecar-install-report
fi

echo "[entrypoint] 启动：$* （状态目录 $DATA，边车目录 $SVC）"
exec "$@"

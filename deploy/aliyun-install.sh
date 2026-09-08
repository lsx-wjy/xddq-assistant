#!/usr/bin/env bash
set -Eeuo pipefail

# 首次部署或升级均可使用。示例：
# curl -fsSL https://raw.githubusercontent.com/<你的账户>/<你的仓库>/main/deploy/aliyun-install.sh | sudo bash -s -- https://github.com/<你的账户>/<你的仓库>.git

if [[ "$(id -u)" -ne 0 ]]; then
  exec sudo -E bash "$0" "$@"
fi

REPO_URL="${1:-${XDDQ_REPO_URL:-https://github.com/gyn7561/xddq-assistant.git}}"
APP_DIR="${XDDQ_APP_DIR:-/opt/xddq-assistant}"
REPO_REF="${XDDQ_REPO_REF:-}"

install_docker() {
  if ! command -v apt-get >/dev/null 2>&1; then
    echo '一键脚本当前仅支持 Ubuntu/Debian 系的 ECS，请使用 Ubuntu 22.04 或 24.04 镜像。' >&2
    exit 1
  fi
  if ! command -v git >/dev/null 2>&1; then
    apt-get update
    apt-get install -y git
  fi
  if ! command -v docker >/dev/null 2>&1; then
    apt-get update
    apt-get install -y ca-certificates curl
    curl -fsSL https://get.docker.com | sh
  fi
  if ! docker compose version >/dev/null 2>&1; then
    apt-get update
    apt-get install -y docker-compose-plugin
  fi
}

create_environment_file() {
  if [[ -f .env ]]; then
    return
  fi

  local domain email admin password
  domain="${DASHBOARD_DOMAIN:-}"
  email="${CADDY_EMAIL:-}"
  admin="${DASHBOARD_BASIC_AUTH_USER:-admin}"
  password="${DASHBOARD_BASIC_AUTH_PASSWORD:-}"
  if [[ -z "$domain" ]]; then
    read -r -p '请输入已解析到这台 ECS 的域名（例如 xddq.example.com）: ' domain
  fi
  if [[ -z "$email" ]]; then
    read -r -p '请输入证书通知邮箱: ' email
  fi
  if [[ -z "${DASHBOARD_BASIC_AUTH_USER:-}" ]]; then
    read -r -p '请输入管理用户名 [admin]: ' admin
  fi
  admin="${admin:-admin}"
  while [[ -z "${password:-}" ]]; do
    read -r -s -p '请输入管理密码（建议 16 位以上）: ' password
    printf '\n'
  done

  if [[ ! "$domain" =~ ^[A-Za-z0-9.-]+$ ]]; then
    echo '域名不能为空，也不能包含协议或路径。' >&2
    exit 1
  fi
  if [[ ! "$admin" =~ ^[A-Za-z0-9_.-]+$ ]]; then
    echo '管理用户名只能包含字母、数字、点、下划线和连字符。' >&2
    exit 1
  fi
  if [[ ! "$password" =~ ^[A-Za-z0-9._~!@%^+=-]{16,}$ ]]; then
    echo '管理密码至少 16 位，且只能使用字母、数字和 . _ ~ ! @ % ^ + = -。' >&2
    exit 1
  fi

  umask 077
  cat > .env <<EOF
DASHBOARD_DOMAIN=$domain
CADDY_EMAIL=$email
DASHBOARD_BASIC_AUTH_USER=$admin
DASHBOARD_BASIC_AUTH_PASSWORD=$password
EOF
  chmod 600 .env
}

install_docker

if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" pull --ff-only
else
  if [[ -e "$APP_DIR" && -n "$(find "$APP_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
    echo "部署目录 $APP_DIR 已存在且不是 Git 仓库，请先迁移或清空其中内容。" >&2
    exit 1
  fi
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
if [[ -n "$REPO_REF" ]]; then
  git fetch --all --tags
  git checkout "$REPO_REF"
fi

create_environment_file
mkdir -p data logs deploy/caddy-data deploy/caddy-config
docker compose up -d --build --remove-orphans
docker compose ps

echo
echo "部署完成：请使用 https://$(grep '^DASHBOARD_DOMAIN=' .env | cut -d= -f2) 打开管理界面。"
echo '首次申请证书需要域名已解析到此服务器，且阿里云安全组已放行 TCP 80 和 443。'

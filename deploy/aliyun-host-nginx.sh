#!/usr/bin/env bash
set -Eeuo pipefail

domain="${1:-}"
email="${2:-}"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
vhost_dir='/www/server/panel/vhost/nginx'
vhost_path="$vhost_dir/$domain.conf"
challenge_dir='/var/www/xddq-certbot'
certificate_dir='/etc/letsencrypt'
http_template="$script_dir/nginx-xddq-http.conf.template"
https_template="$script_dir/nginx-xddq-https.conf.template"
backup_path=''
temporary_path=''

if [[ ! "$domain" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo 'Invalid dashboard domain.' >&2
  exit 1
fi
if [[ ! "$email" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
  echo 'Invalid certificate email.' >&2
  exit 1
fi
if ! command -v nginx >/dev/null 2>&1; then
  echo 'Host Nginx was not found.' >&2
  exit 1
fi
if [[ ! -d "$vhost_dir" ]]; then
  echo "BaoTa Nginx vhost directory was not found: $vhost_dir" >&2
  exit 1
fi
if [[ ! -f "$http_template" || ! -f "$https_template" ]]; then
  echo 'Nginx deployment templates are missing.' >&2
  exit 1
fi

mkdir -p "$challenge_dir" "$certificate_dir"
if [[ -f "$vhost_path" ]]; then
  backup_path="$vhost_path.backup-$(date +%Y%m%d%H%M%S)"
  cp -a "$vhost_path" "$backup_path"
fi

restore_previous_config() {
  local exit_code=$?
  if [[ -n "$temporary_path" && -f "$temporary_path" ]]; then
    rm -f "$temporary_path"
  fi
  if [[ -n "$backup_path" && -f "$backup_path" ]]; then
    cp -a "$backup_path" "$vhost_path"
  else
    rm -f "$vhost_path"
  fi
  nginx -t >/dev/null 2>&1 && nginx -s reload >/dev/null 2>&1 || true
  exit "$exit_code"
}
trap restore_previous_config ERR

install_template() {
  local template_path=$1
  temporary_path="$(mktemp "$vhost_dir/.xddq-assistant.XXXXXX")"
  cp "$template_path" "$temporary_path"
  sed -i "s/__DOMAIN__/$domain/g" "$temporary_path"
  install -m 644 "$temporary_path" "$vhost_path"
  rm -f "$temporary_path"
  temporary_path=''
}

install_template "$http_template"
nginx -t
nginx -s reload

docker run --rm \
  -v "$certificate_dir:/etc/letsencrypt" \
  -v "$challenge_dir:/var/www/xddq-certbot" \
  certbot/certbot:latest certonly \
  --non-interactive \
  --agree-tos \
  --no-eff-email \
  --keep-until-expiring \
  --cert-name "$domain" \
  --email "$email" \
  --webroot \
  --webroot-path /var/www/xddq-certbot \
  -d "$domain"

install_template "$https_template"
nginx -t
nginx -s reload

docker_path="$(command -v docker)"
nginx_path="$(command -v nginx)"
renew_command="$docker_path run --rm -v $certificate_dir:/etc/letsencrypt -v $challenge_dir:/var/www/xddq-certbot certbot/certbot:latest renew --quiet && $nginx_path -s reload"
printf '23 3 * * * root %s\n' "$renew_command" > /etc/cron.d/xddq-assistant-certbot
chmod 644 /etc/cron.d/xddq-assistant-certbot

trap - ERR
echo "Host Nginx is serving https://$domain -> http://127.0.0.1:4173"

#!/usr/bin/env bash
set -euo pipefail

if ! command -v curl >/dev/null 2>&1; then
  echo "[ERROR] curl is required" >&2
  exit 1
fi

if ! command -v awk >/dev/null 2>&1; then
  echo "[ERROR] awk is required" >&2
  exit 1
fi

if [ "$#" -gt 0 ]; then
  URLS=("$@")
else
  URLS=(
    "https://tradetally.io/"
    "https://tradetally.io/robots.txt"
    "https://tradetally.io/sitemap.xml"
  )
fi

to_ms() {
  awk -v seconds="$1" 'BEGIN { printf "%.0f", seconds * 1000 }'
}

printf "%-5s %8s %8s %8s %8s %8s  %s\n" "HTTP" "DNS" "TCP" "TLS" "TTFB" "TOTAL" "URL"

for url in "${URLS[@]}"; do
  if ! metrics="$(curl -L -o /dev/null -sS -w '%{http_code} %{time_namelookup} %{time_connect} %{time_appconnect} %{time_starttransfer} %{time_total}' "$url")"; then
    printf "%-5s %8s %8s %8s %8s %8s  %s\n" "ERR" "-" "-" "-" "-" "-" "$url"
    continue
  fi

  read -r status dns tcp tls ttfb total <<< "$metrics"
  printf "%-5s %7sms %7sms %7sms %7sms %7sms  %s\n" \
    "$status" \
    "$(to_ms "$dns")" \
    "$(to_ms "$tcp")" \
    "$(to_ms "$tls")" \
    "$(to_ms "$ttfb")" \
    "$(to_ms "$total")" \
    "$url"
done

#!/usr/bin/env bash
# Start a local HTTP server for the Button Lab website.
# Needed because browsers block fetch() of local .json files over file://
#
# serve.py binds to all interfaces (host "" = 0.0.0.0), so the site is
# reachable from OTHER MACHINES on the same network. This script detects
# this machine's IPv4 addresses and prints the URLs to use.
set -euo pipefail

cd "$(dirname "$0")"

PORT="${1:-9999}"

# Stop any previous instance of this server on the same port
if lsof -ti tcp:"${PORT}" >/dev/null 2>&1; then
    echo "Port ${PORT} is already in use. Stopping that process..."
    lsof -ti tcp:"${PORT}" | xargs kill
    sleep 1
fi

python3 serve.py "${PORT}" >/dev/null 2>&1 &
SERVER_PID=$!

# Give the server a moment to bind
sleep 1

LOCAL_URL="http://localhost:${PORT}/index.html"

echo ""
echo "Button Lab website server running"
echo ""
echo "  Local (this machine only): ${LOCAL_URL}"
echo ""

# Discover this machine's non-loopback IPv4 addresses so other machines can
# reach the site. Linux: iproute2 (skip docker/virtual bridge interfaces).
# macOS: best-effort via the primary interface (en0).
IFACES=""
if command -v ip >/dev/null 2>&1; then
    IFACES=$(ip -4 -o addr show scope global 2>/dev/null | \
        awk '$2 !~ /^(docker|br-|virbr|veth)/ { split($4, a, "/"); print $2 " " a[1] }' || true)
elif command -v ipconfig >/dev/null 2>&1; then
    mac_ip=$(ipconfig getifaddr en0 2>/dev/null || true)
    [ -n "${mac_ip}" ] && IFACES="en0 ${mac_ip}"
fi

if [ -n "${IFACES}" ]; then
    echo "  On the network — open one of these on OTHER machines:"
    while read -r iface addr; do
        [ -z "${addr}" ] && continue
        echo "    http://${addr}:${PORT}/index.html   (${iface})"
    done <<< "${IFACES}"
    echo ""
    echo "  Note: a machine can only reach the link for a network it shares"
    echo "  with this one (same LAN/VLAN, campus network, or Tailscale VPN)."
    echo ""
fi

# Open the browser on this machine.
# macOS uses `open`; Linux uses `xdg-open` (no-op/print if neither exists).
if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "${LOCAL_URL}" >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
    open "${LOCAL_URL}"
else
    echo "No browser opener found — open ${LOCAL_URL} manually."
fi

# Keep the script attached to the server so Ctrl+C stops it
wait "${SERVER_PID}"

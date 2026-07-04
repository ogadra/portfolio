#!/usr/bin/env bash
set -euo pipefail

usage() {
	printf 'usage: %s <url> -- <command> [args...]\n' "${0##*/}" >&2
}

if [[ $# -lt 3 || "${2:-}" != "--" ]]; then
	usage
	exit 64
fi

url=$1
shift 2

"$@" > /dev/null 2>&1 &
server_pid=$!

cleanup() {
	kill "$server_pid" 2> /dev/null || true
	wait "$server_pid" 2> /dev/null || true
}
trap cleanup EXIT

for _ in {1..30}; do
	if curl --fail --silent --output /dev/null "$url"; then
		exit 0
	fi

	if ! kill -0 "$server_pid" 2> /dev/null; then
		exit 1
	fi

	sleep 1
done

exit 1

#!/bin/bash
# args: key path url
key="$1"; path="$2"; url="$3"
fn=$(basename "$path")
mkdir -p "/tmp/vcsl_raw/$key"
out="/tmp/vcsl_raw/$key/$fn"
if [ ! -s "$out" ]; then
  curl -s -f -L --retry 3 -m 300 -o "$out" "$url" || echo "FAIL $url"
fi

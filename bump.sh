#!/bin/sh
# Bump the ?v= cache-buster on every asset in index.html, so a deploy can never
# be served half-old. Run this after any CSS/JS change, before committing.
cd "$(dirname "$0")"
cur=$(sed -n 's/.*style\.css?v=\([0-9]*\).*/\1/p' index.html | head -1)
next=$((cur + 1))
sed -i '' "s/?v=$cur\"/?v=$next\"/g" index.html
echo "assets now at v$next"

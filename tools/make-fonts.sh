#!/bin/sh
# The face, self-hosted: Satoshi (Indian Type Foundry, Fontshare), the variable woff2 exactly as Fontshare ships it.
# No subsetting or conversion: the Fontshare Free Font License forbids modifying the file (fonts/README.md).
# Source: the Satoshi_Complete download from fontshare.com. Run from the repo root.
set -e
SRC="${1:-$HOME/Downloads/Satoshi_Complete/Fonts/WEB/fonts}/Satoshi-Variable.woff2"
cp "$SRC" fonts/Satoshi-Variable.woff2
cmp "$SRC" fonts/Satoshi-Variable.woff2 && echo "fonts/Satoshi-Variable.woff2: identical to Fontshare's file"
ls -l fonts/*.woff2

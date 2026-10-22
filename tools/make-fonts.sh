#!/bin/sh
# The mono face, self-hosted: JetBrains Mono (the NL build: no ligatures, so "->" stays two characters),
# subset to Latin (Basic + Latin-1), digits and the punctuation the copy uses, weights 400 and 500, as woff2.
# Source: the installed JetBrainsMonoNL Nerd Font TTFs (OFL-1.1; the Nerd glyphs fall away in the subset).
# Needs fontTools + brotli (the system /usr/bin/python3 has both). Run from the repo root.
set -e
SRC="$HOME/Library/Fonts"
UNI="U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+2013-2014,U+2018-201E,U+2022,U+2026,U+2032-2033,U+2190-2193,U+2212,U+2713,U+2715"
for pair in "Regular:400" "Medium:500"; do
  style=${pair%%:*}; weight=${pair##*:}
  /usr/bin/python3 -m fontTools.subset "$SRC/JetBrainsMonoNLNerdFontMono-$style.ttf" \
    --unicodes="$UNI" --layout-features='kern,tnum,zero,case' --flavor=woff2 \
    --name-IDs='*' --name-languages='*' --output-file="fonts/jbm-$weight.woff2"
done
ls -l fonts/*.woff2

#!/bin/sh
set -eu

# Fail the image build if fonts failed to download or an alias silently chooses
# a generic font. This also runs standalone against a built converter image.
while IFS='|' read -r requested expected; do
  actual=$(fc-match --format='%{family}' "$requested")
  if [ "$actual" != "$expected" ]; then
    printf '%s: expected %s, got %s\n' "$requested" "$expected" "$actual" >&2
    exit 1
  fi
  printf '%s -> %s\n' "$requested" "$actual"
done <<'FONTS'
Calibri|Carlito
Calibri Light|Carlito
Cambria|Caladea
Arial|Arial
Arial Black|Arial Black
Arial Narrow|Liberation Sans Narrow
Times New Roman|Times New Roman
Courier New|Courier New
Georgia|Georgia
Verdana|Verdana
Trebuchet MS|Trebuchet MS
Tahoma|Tahoma
Symbol|Symbol
Wingdings|Wingdings
Impact|Impact
Comic Sans MS|Comic Sans MS
Andale Mono|Andale Mono
Webdings|Webdings
Book Antiqua|TeX Gyre Pagella
Palatino Linotype|TeX Gyre Pagella
Century Schoolbook|TeX Gyre Schola
Bookman Old Style|TeX Gyre Bonum
FONTS

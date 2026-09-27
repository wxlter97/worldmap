#!/usr/bin/env bash
# Descarga los datos crudos a data-raw/ (ignorado por git). Luego: npm run build:data
set -euo pipefail
cd "$(dirname "$0")/.." && mkdir -p data-raw && cd data-raw
NE=https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson
curl -sSfLO "$NE/ne_50m_admin_0_countries.geojson"
curl -sSfLO "$NE/ne_10m_admin_1_states_provinces.geojson"
curl -sSfLO https://download.geonames.org/export/dump/cities15000.zip && unzip -o -q cities15000.zip
curl -sSfLO https://download.geonames.org/export/dump/countryInfo.txt
node ../scripts/fetch-wikidata.mjs

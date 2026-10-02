#!/bin/sh
set -eu

db_path="${ELOSYS_DB_PATH:-/data/elosys.db}"
db_url="${ELOSYS_DB_URL:-https://huggingface.co/datasets/YuriRDev/elosys/resolve/main/elosys.zip}"
db_sha256="${ELOSYS_DB_SHA256:-96fb819b681752250db0c6cdc62566d1773338547daf6ea524edcd4024b16693}"

if [ ! -f "$db_path" ]; then
  db_dir=$(dirname "$db_path")
  mkdir -p "$db_dir"
  download_dir=$(mktemp -d "$db_dir/.elosys-download.XXXXXX")
  trap 'rm -rf "$download_dir"' EXIT
  trap 'exit 1' INT TERM

  echo "Downloading the EloSys database (about 3 GB compressed; allow at least 15 GB free)..."
  curl --fail --location --retry 3 --connect-timeout 30 \
    --output "$download_dir/elosys.zip" "$db_url"
  printf '%s  %s\n' "$db_sha256" "$download_dir/elosys.zip" | sha256sum -c -

  echo "Extracting elosys.db..."
  unzip -p "$download_dir/elosys.zip" elosys.db > "$download_dir/elosys.db"
  node -e 'const Database = require("better-sqlite3"); const db = new Database(process.argv[1], { readonly: true, fileMustExist: true }); db.prepare("SELECT name FROM sqlite_master LIMIT 1").get(); db.close();' "$download_dir/elosys.db"
  mv "$download_dir/elosys.db" "$db_path"
  rm -rf "$download_dir"
  trap - EXIT INT TERM
  echo "Database ready at $db_path."
else
  echo "Using existing database at $db_path."
fi

exec "$@"

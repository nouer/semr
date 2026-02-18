#!/bin/bash
cd "$(dirname "$0")/.."

set -euo pipefail

# Worktreeを複数同時に動かしても衝突しないように、Composeのプロジェクト名をパスから安定生成する。
if [ -z "${COMPOSE_PROJECT_NAME:-}" ]; then
  if command -v python3 >/dev/null 2>&1; then
    export COMPOSE_PROJECT_NAME="emr_$(python3 - <<'PY'
import hashlib, os
print(hashlib.sha1(os.getcwd().encode('utf-8')).hexdigest()[:10])
PY
)"
  fi
fi

# Worktreeごとのネットワーク衝突を避けるため、サブネットと固定IPをプロジェクト単位で自動生成する。
if [ -z "${EMR_SUBNET:-}" ] || [ -z "${EMR_APP_IP:-}" ]; then
  if command -v python3 >/dev/null 2>&1; then
    eval "$(python3 - <<'PY'
import hashlib, os
proj = os.environ.get("COMPOSE_PROJECT_NAME") or hashlib.sha1(os.getcwd().encode("utf-8")).hexdigest()[:10]
h = hashlib.sha1(proj.encode("utf-8")).hexdigest()
oct3 = (int(h[:4], 16) % 200) + 20  # 20..219
subnet = f"172.31.{oct3}.0/24"
ip = f"172.31.{oct3}.10"
print(f'export EMR_SUBNET="{subnet}"')
print(f'export EMR_APP_IP="{ip}"')
PY
)"
  fi
fi

# デフォルトは 8083。必要なら EMR_PORT を指定する。
EMR_PORT="${EMR_PORT:-8083}"
./scripts/generate_version.sh
echo "Building and starting containers..."
docker compose up -d --build emr-app emr-app-public
echo "Done! App is running at http://localhost:${EMR_PORT}"

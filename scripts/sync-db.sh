#!/bin/bash
# 全平台同步到本仓库生产库；不生成 Markdown、不写索引、不碰其他仓库。
# cronn: 0 */8 * * * "$HOME/workspaces/bgzo/export-to-obsidian/scripts/sync-db.sh"
set -u

repo_dir="${ETO_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
eto_db="${ETO_DB:-$repo_dir/data/eto.db}"
cookies="$repo_dir/cookies.txt"
env_file="$repo_dir/.env"
eto_bin="${ETO_BIN:-eto}"

[[ -f "$env_file" ]] || { echo "missing env: $env_file"; exit 1; }
# .env 里是普通赋值，必须 allexport 才能传给 eto 子进程
set -o allexport
source "$env_file"
set +o allexport
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# 防止路径写错时 sqlite 静默新建空库
[[ "$eto_db" = /* && -f "$eto_db" ]] || { echo "bad db: $eto_db"; exit 1; }
[[ -f "$cookies" ]] || { echo "missing cookies: $cookies"; exit 1; }

# 单平台失败不阻断其余平台，最后统一返回失败码
failed=0
run() {
  echo "== $*"
  "$eto_bin" --db "$eto_db" --db-only --cookies-file "$cookies" "$@" || failed=1
}

run qireader -t tag-Jw3lnV59k7Vaky2g
run bangumi -s 1 -c 2
run bangumi -s 2 -c 2
run bangumi -s 3 -c 2
run bangumi -s 4 -c 2
run cnblog
run zhihu -c 908297073
run v2ex
run v2ex --tipped
run bilibili -f 49128283
run github
run netease
run twitter
run twitter --bookmarks

exit "$failed"

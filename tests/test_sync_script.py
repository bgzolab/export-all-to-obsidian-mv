"""scripts/sync-db.sh 的参数与失败聚合行为。"""

import os
import shlex
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'sync-db.sh'


def _run(
    tmp_path: Path,
    fail_on: str | None = None,
    env_content: str = '',
    require_token: bool = False,
    drop: str | None = None,
):
    repo = tmp_path / 'repo'
    (repo / 'data').mkdir(parents=True)
    (repo / 'data' / 'eto.db').write_bytes(b'')
    (repo / 'cookies.txt').write_text('', encoding='utf-8')
    (repo / '.env').write_text(env_content, encoding='utf-8')
    if drop is not None:
        (repo / drop).unlink()

    log = tmp_path / 'calls.log'
    stub = tmp_path / 'eto'
    stub.write_text(
        '#!/bin/sh\n'
        + ('[ "${BGM_ACCESS_TOKEN:-}" = dummy ] || exit 1\n' if require_token else '')
        + f'printf "%s\\n" "$*" >> "{log}"\n'
        + (f'case "$*" in *{fail_on}*) exit 1;; esac\n' if fail_on else '')
        + 'exit 0\n',
        encoding='utf-8',
    )
    stub.chmod(0o755)

    env = os.environ | {'ETO_REPO': str(repo), 'ETO_BIN': str(stub)}
    result = subprocess.run(
        [str(SCRIPT)],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    calls = log.read_text(encoding='utf-8').splitlines() if log.exists() else []
    return result, calls


def test_every_call_is_db_only(tmp_path):
    result, calls = _run(tmp_path)
    assert result.returncode == 0, result.stderr
    assert len(calls) == 14
    for call in calls:
        tokens = shlex.split(call)
        assert '--db-only' in tokens
        assert '--db' in tokens
        assert '--cookies-file' in tokens
        assert '-o' not in tokens
        for flag in ('--force', '--full', '--max-pages', '--index-file', '--prefix'):
            assert flag not in tokens


def test_failure_does_not_abort_remaining_platforms(tmp_path):
    result, calls = _run(tmp_path, fail_on='cnblog')
    assert result.returncode == 1
    assert any('cnblog' in call for call in calls)
    assert any('twitter --bookmarks' in call for call in calls)


def test_env_file_is_exported_to_eto(tmp_path):
    result, _calls = _run(
        tmp_path,
        env_content='BGM_ACCESS_TOKEN=dummy\n',
        require_token=True,
    )
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize(
    ('drop', 'message'),
    [
        ('data/eto.db', 'bad db:'),
        ('.env', 'missing env:'),
        ('cookies.txt', 'missing cookies:'),
    ],
)
def test_missing_prerequisite_aborts_before_eto(tmp_path, drop, message):
    result, calls = _run(tmp_path, drop=drop)
    assert result.returncode != 0
    assert message in result.stdout
    assert calls == []


def test_script_does_not_reference_clippers():
    assert 'clippers' not in SCRIPT.read_text(encoding='utf-8')

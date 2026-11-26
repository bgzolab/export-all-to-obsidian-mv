"""Production static hosting and SPA fallback for the built Vue app."""

from __future__ import annotations


def _build_dist(tmp_path):
    dist = tmp_path / 'dist'
    (dist / 'assets').mkdir(parents=True)
    (dist / 'index.html').write_text('<html>app-shell</html>', encoding='utf-8')
    (dist / 'assets' / 'app.js').write_text('console.log(1)', encoding='utf-8')
    return dist


def test_spa_serves_root_deep_links_and_assets(client, tmp_path, monkeypatch):
    dist = _build_dist(tmp_path)
    monkeypatch.setattr('app.main.get_frontend_dist', lambda: dist)

    assert client.get('/').text == '<html>app-shell</html>'
    # Vue Router owns this path; a refresh must return the SPA shell.
    assert client.get('/t/zhihu_content').text == '<html>app-shell</html>'
    assert client.get('/assets/app.js').text == 'console.log(1)'


def test_unknown_api_path_stays_json_404(client, tmp_path, monkeypatch):
    dist = _build_dist(tmp_path)
    monkeypatch.setattr('app.main.get_frontend_dist', lambda: dist)

    response = client.get('/api/not-a-route')
    assert response.status_code == 404
    assert response.json()['detail'] == 'not found'


def test_static_path_does_not_escape_dist(client, tmp_path, monkeypatch):
    dist = _build_dist(tmp_path)
    (tmp_path / 'secret.txt').write_text('secret', encoding='utf-8')
    monkeypatch.setattr('app.main.get_frontend_dist', lambda: dist)

    response = client.get('/..%2Fsecret.txt')
    assert response.status_code == 404 or response.text == '<html>app-shell</html>'


def test_missing_dist_reports_not_built(client, tmp_path, monkeypatch):
    monkeypatch.setattr('app.main.get_frontend_dist', lambda: tmp_path / 'missing')

    response = client.get('/')
    assert response.status_code == 404
    assert response.json()['detail'] == 'frontend not built'

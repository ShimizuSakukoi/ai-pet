"""
版本检测 —— 调 GitHub API 获取最新 release
=========================================
GET https://api.github.com/repos/{repo}/releases/latest
比较 tag_name 与本地 APP_VERSION，通知前端是否有更新。

GitHub API 限流：未认证 60 次/小时，手动触发足够用。
"""
import requests
from config import APP_VERSION, GITHUB_REPO


def _parse_version(v: str) -> tuple:
    """去 v 前缀，按 . 拆成整数元组。v1.0.3 → (1, 0, 3)"""
    v = v.strip().lstrip("v")
    parts = v.replace("-", ".").split(".")[:3]
    result = []
    for p in parts:
        try:
            result.append(int(p))
        except ValueError:
            # 非数字段（如 beta）→ 取 ASCII 码和做比较
            result.append(sum(ord(c) for c in p[:5]))
    while len(result) < 3:
        result.append(0)
    return tuple(result[:3])


def check_update() -> dict:
    """
    调 GitHub Releases API 获取最新版本
    @returns {ok, has_update, current, latest, url, error?}
    """
    try:
        resp = requests.get(
            f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest",
            headers={"Accept": "application/vnd.github.v3+json"},
            timeout=10,
        )
        if resp.status_code == 404:
            return {"ok": False, "error": "仓库暂无发布版本"}
        if resp.status_code != 200:
            return {"ok": False, "error": f"GitHub API 返回 {resp.status_code}"}

        data = resp.json()
        tag = data.get("tag_name", "")
        url = data.get("html_url", "")

        if not tag:
            return {"ok": False, "error": "无法解析版本号"}

        latest = _parse_version(tag)
        current = _parse_version(APP_VERSION)

        return {
            "ok": True,
            "has_update": latest > current,
            "current": APP_VERSION,
            "latest": tag.lstrip("v"),
            "url": url,
        }
    except requests.exceptions.Timeout:
        return {"ok": False, "error": "请求超时，请检查网络"}
    except requests.exceptions.ConnectionError:
        return {"ok": False, "error": "网络连接失败"}
    except Exception as e:
        return {"ok": False, "error": str(e)[:100]}

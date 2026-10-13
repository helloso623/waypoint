"""Web search for Agent chat on OpenAI/Grok (Claude keeps its native tool).

Tries Brave, Tavily, or SerpAPI when a key is set; otherwise DuckDuckGo HTML.
"""
import os
import re
from html import unescape
from urllib.parse import unquote, urlparse


def _clean(text, limit=280):
    text = re.sub(r"\s+", " ", (text or "")).strip()
    return text[:limit]


def _brave(query):
    import requests
    key = (os.environ.get("BRAVE_SEARCH_API_KEY") or "").strip()
    if not key:
        return None
    resp = requests.get(
        "https://api.search.brave.com/res/v1/web/search",
        params={"q": query, "count": 5},
        headers={"Accept": "application/json", "X-Subscription-Token": key},
        timeout=15,
    )
    resp.raise_for_status()
    hits = []
    for item in (resp.json().get("web") or {}).get("results") or []:
        hits.append({
            "title": _clean(item.get("title"), 160),
            "url": item.get("url") or "",
            "snippet": _clean(item.get("description")),
        })
    return {"provider": "brave", "results": hits}


def _tavily(query):
    import requests
    key = (os.environ.get("TAVILY_API_KEY") or "").strip()
    if not key:
        return None
    resp = requests.post(
        "https://api.tavily.com/search",
        json={"api_key": key, "query": query, "max_results": 5},
        timeout=15,
    )
    resp.raise_for_status()
    hits = []
    for item in resp.json().get("results") or []:
        hits.append({
            "title": _clean(item.get("title"), 160),
            "url": item.get("url") or "",
            "snippet": _clean(item.get("content")),
        })
    return {"provider": "tavily", "results": hits}


def _serpapi(query):
    import requests
    key = (os.environ.get("SERPAPI_KEY") or os.environ.get("SERPAPI_API_KEY") or "").strip()
    if not key:
        return None
    resp = requests.get(
        "https://serpapi.com/search.json",
        params={"q": query, "api_key": key, "engine": "google", "num": 5},
        timeout=15,
    )
    resp.raise_for_status()
    hits = []
    for item in resp.json().get("organic_results") or []:
        hits.append({
            "title": _clean(item.get("title"), 160),
            "url": item.get("link") or "",
            "snippet": _clean(item.get("snippet")),
        })
    return {"provider": "serpapi", "results": hits}


def _duckduckgo(query):
    import requests
    resp = requests.post(
        "https://html.duckduckgo.com/html/",
        data={"q": query},
        headers={"User-Agent": "Waypoint/1.0"},
        timeout=15,
    )
    resp.raise_for_status()
    html = resp.text or ""
    hits = []
    for href, title in re.findall(
        r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
        html,
        flags=re.I | re.S,
    ):
        url = unescape(href)
        if "uddg=" in url:
            m = re.search(r"uddg=([^&]+)", url)
            if m:
                url = unquote(m.group(1))
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            continue
        hits.append({
            "title": _clean(re.sub(r"<[^>]+>", "", unescape(title)), 160),
            "url": url,
            "snippet": "",
        })
        if len(hits) >= 5:
            break
    return {"provider": "duckduckgo", "results": hits}


def search(query):
    q = (query or "").strip()
    if not q:
        return {"error": "query is required"}
    last = None
    for fn in (_brave, _tavily, _serpapi, _duckduckgo):
        try:
            result = fn(q)
        except Exception as exc:
            last = str(exc)
            try:
                import runtime_errors
                runtime_errors.note(f"web_search.{fn.__name__}", exc)
            except Exception:
                print(f"[web_search.{fn.__name__}] {exc}")
            continue
        if result and result.get("results"):
            return {"ok": True, "query": q, **result}
        if result is not None and not result.get("results"):
            last = f"{result.get('provider')} returned no hits"
    return {"error": last or "web search failed", "query": q}

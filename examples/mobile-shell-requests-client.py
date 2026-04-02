#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import random
import time
from typing import Dict, Optional
from urllib.parse import urlencode

import requests


BASE_URL = "https://example.invalid"
API_PREFIX = "/api"
REFERER = f"{BASE_URL}/app/"
APP_SIGN_KEY = "REPLACE_WITH_RUNTIME_VERIFIED_SIGN_KEY"


def build_session() -> requests.Session:
    session = requests.Session()
    session.trust_env = False
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 "
                "Mobile/15E148 Safari/604.1"
            ),
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Referer": REFERER,
            "Origin": BASE_URL,
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Cipher-App-Id": "v1",
        }
    )
    return session


def sign_params(params: Dict[str, object], app_sign_key: str = APP_SIGN_KEY) -> Dict[str, str]:
    signed = {key: str(value) for key, value in params.items() if value is not None}
    signed["timestamp"] = str(int(time.time() * 1000))
    signed["noncestr"] = "".join(random.choice("0123456789") for _ in range(8))

    material = dict(signed)
    material["appSignKey"] = app_sign_key
    canonical = "&".join(f"{key}={material[key]}" for key in sorted(material))
    signed["sign"] = hashlib.sha1(canonical.encode("utf-8")).hexdigest()
    return signed


def build_url(path: str, params: Dict[str, object]) -> str:
    query = urlencode(sign_params(params))
    return f"{BASE_URL}{API_PREFIX}{path}?{query}"


def api_get(
    session: requests.Session,
    path: str,
    *,
    params: Optional[Dict[str, object]] = None,
    timeout: float = 20.0,
) -> Dict[str, object]:
    url = build_url(path, params or {})
    response = session.get(url, timeout=timeout)
    response.raise_for_status()
    payload = response.json()
    if payload.get("code") not in ("success", 0, "0", None):
        raise RuntimeError(f"unexpected API response: {payload}")
    return payload


def fetch_structure(session: requests.Session) -> Dict[str, object]:
    return api_get(session, "/board/board-group-list")


def fetch_board_detail(session: requests.Session, board_id: int) -> Dict[str, object]:
    return api_get(session, "/content/board/detail", params={"boardId": board_id})


def fetch_board_list(
    session: requests.Session,
    board_id: int,
    *,
    page_num: int = 1,
    page_size: int = 20,
    post_type: int = 0,
    order_type: int = 0,
) -> Dict[str, object]:
    return api_get(
        session,
        "/content/board/list",
        params={
            "boardId": board_id,
            "pageNum": page_num,
            "pageSize": page_size,
            "postType": post_type,
            "orderType": order_type,
        },
    )


def main() -> None:
    session = build_session()
    structure = fetch_structure(session)
    print(json.dumps({"structure_keys": list((structure.get("data") or {}))}, ensure_ascii=False, indent=2))

    # Replace with one runtime-verified board or category mapping.
    board_id = 123
    detail = fetch_board_detail(session, board_id)
    listing = fetch_board_list(session, board_id, page_num=1, page_size=5)
    print(
        json.dumps(
            {
                "detail": detail,
                "listing_preview": listing,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

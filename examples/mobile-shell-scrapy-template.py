from __future__ import annotations

import hashlib
import random
import time
from urllib.parse import urlencode

import scrapy
from scrapy.http import JsonRequest


BASE_URL = "https://example.invalid"
API_PREFIX = "/api"
REFERER = f"{BASE_URL}/app/"
APP_SIGN_KEY = "REPLACE_WITH_RUNTIME_VERIFIED_SIGN_KEY"


def sign_params(params: dict[str, object], app_sign_key: str = APP_SIGN_KEY) -> dict[str, str]:
    signed = {key: str(value) for key, value in params.items() if value is not None}
    signed["timestamp"] = str(int(time.time() * 1000))
    signed["noncestr"] = "".join(random.choice("0123456789") for _ in range(8))
    material = dict(signed)
    material["appSignKey"] = app_sign_key
    canonical = "&".join(f"{key}={material[key]}" for key in sorted(material))
    signed["sign"] = hashlib.sha1(canonical.encode("utf-8")).hexdigest()
    return signed


class MobileShellSpider(scrapy.Spider):
    name = "mobile_shell_api"

    custom_settings = {
        "ROBOTSTXT_OBEY": False,
        "COOKIES_ENABLED": True,
        "CONCURRENT_REQUESTS": 2,
        "CONCURRENT_REQUESTS_PER_DOMAIN": 1,
        "DOWNLOAD_DELAY": 1.0,
        "RANDOMIZE_DOWNLOAD_DELAY": True,
        "DEFAULT_REQUEST_HEADERS": {
            "User-Agent": (
                "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 "
                "Mobile/15E148 Safari/604.1"
            ),
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Referer": REFERER,
            "Origin": BASE_URL,
            "Cipher-App-Id": "v1",
        },
    }

    def start_requests(self):
        yield self.api_request("/board/board-group-list", {}, self.parse_groups)

    def api_request(self, path: str, params: dict[str, object], callback):
        url = f"{BASE_URL}{API_PREFIX}{path}?{urlencode(sign_params(params))}"
        return JsonRequest(url=url, callback=callback, dont_filter=True)

    def parse_groups(self, response: scrapy.http.Response):
        payload = response.json()
        for group in payload.get("data") or []:
            yield {
                "type": "group",
                "group_id": group.get("groupId"),
                "group_title": group.get("groupTitle"),
            }
            for board in group.get("boards") or []:
                board_id = board.get("id")
                yield self.api_request(
                    "/content/board/list",
                    {
                        "boardId": board_id,
                        "pageNum": 1,
                        "pageSize": 20,
                        "postType": 0,
                        "orderType": 0,
                    },
                    self.parse_board_list,
                )

    def parse_board_list(self, response: scrapy.http.Response):
        payload = response.json()
        data = payload.get("data") or {}
        for item in data.get("result") or []:
            user = item.get("postUser") or {}
            yield {
                "type": "post",
                "board_id": item.get("boardId"),
                "post_id": item.get("postId"),
                "subject": item.get("subject"),
                "reads": item.get("reads"),
                "pv": item.get("pv"),
                "nickname": user.get("nickname"),
            }

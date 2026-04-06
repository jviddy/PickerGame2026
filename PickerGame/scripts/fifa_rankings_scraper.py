#!/usr/bin/env python3

import argparse
import json
import re
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen


DEFAULT_URL = "https://inside.fifa.com/fifa-world-ranking/men"


def fetch_html(url: str) -> str:
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    with urlopen(request, timeout=45) as response:
        return response.read().decode("utf-8", errors="ignore")


def extract_next_data(html: str) -> dict[str, Any]:
    match = re.search(
        r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
        html,
        flags=re.DOTALL,
    )
    if not match:
        raise RuntimeError("Could not find __NEXT_DATA__ in page source")
    return json.loads(match.group(1))


def _coerce_rank(item: dict[str, Any]) -> int | None:
    preferred_keys = (
        "position",
        "rank",
        "ranking",
        "currentPosition",
        "worldRank",
        "rk",
    )

    for key in preferred_keys:
        value = item.get(key)
        if isinstance(value, int) and 1 <= value <= 300:
            return value
        if isinstance(value, str):
            match = re.search(r"\d+", value)
            if match:
                parsed = int(match.group())
                if 1 <= parsed <= 300:
                    return parsed

    fuzzy_candidates: list[int] = []
    for key, value in item.items():
        key_lower = key.lower()
        if "rank" in key_lower or "position" in key_lower:
            if isinstance(value, int) and 1 <= value <= 300:
                fuzzy_candidates.append(value)
            elif isinstance(value, str):
                match = re.search(r"\d+", value)
                if match:
                    parsed = int(match.group())
                    if 1 <= parsed <= 300:
                        fuzzy_candidates.append(parsed)

    if fuzzy_candidates:
        return min(fuzzy_candidates)

    return None


def _coerce_team_name(item: dict[str, Any]) -> str | None:
    for key in ("countryName", "teamName", "name"):
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    nested_country = item.get("country")
    if isinstance(nested_country, dict):
        for key in ("countryName", "name", "teamName"):
            value = nested_country.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

    nested_team = item.get("team")
    if isinstance(nested_team, dict):
        for key in ("countryName", "name", "teamName"):
            value = nested_team.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

    return None


def _coerce_flag_url(item: dict[str, Any]) -> str | None:
    flag_url = item.get("flagUrl")
    if isinstance(flag_url, str) and flag_url.startswith("http"):
        return flag_url

    country_code = item.get("countryCode") or item.get("code")
    if not country_code and isinstance(item.get("country"), dict):
        country_code = item["country"].get("countryCode") or item["country"].get("code")
    if not country_code and isinstance(item.get("team"), dict):
        country_code = item["team"].get("countryCode") or item["team"].get("code")

    if isinstance(country_code, str) and country_code.strip():
        return f"https://api.fifa.com/api/v3/picture/flags-sq-3/{country_code.strip().upper()}"

    return None


def _walk_dicts(node: Any, out: list[dict[str, Any]]) -> None:
    if isinstance(node, dict):
        out.append(node)
        for value in node.values():
            _walk_dicts(value, out)
    elif isinstance(node, list):
        for value in node:
            _walk_dicts(value, out)


def extract_rankings(next_data: dict[str, Any]) -> list[dict[str, Any]]:
    all_dicts: list[dict[str, Any]] = []
    _walk_dicts(next_data, all_dicts)

    extracted: list[dict[str, Any]] = []
    for item in all_dicts:
        team = _coerce_team_name(item)
        rank = _coerce_rank(item)
        flag_url = _coerce_flag_url(item)

        if not team or rank is None or not flag_url:
            continue

        extracted.append(
            {
                "countryName": team,
                "worldRank": rank,
                "flagUrl": flag_url,
            }
        )

    unique_by_team: dict[str, dict[str, Any]] = {}
    for row in extracted:
        team_name = row["countryName"]
        previous = unique_by_team.get(team_name)
        if previous is None or row["worldRank"] < previous["worldRank"]:
            unique_by_team[team_name] = row

    rankings = sorted(unique_by_team.values(), key=lambda x: x["worldRank"])

    if not rankings:
        raise RuntimeError("Parsed candidate list but found no valid ranking rows")

    if len(rankings) < 100:
        raise RuntimeError(
            f"Expected many ranking rows, but parsed only {len(rankings)} teams."
        )

    return rankings


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scrape FIFA men's ranking page and output team rank + flag URL",
    )
    parser.add_argument("--url", default=DEFAULT_URL, help="Ranking page URL")
    parser.add_argument(
        "--output",
        default="Data/fifa_world_rankings.json",
        help="Output JSON file path",
    )
    args = parser.parse_args()

    html = fetch_html(args.url)
    next_data = extract_next_data(html)
    rankings = extract_rankings(next_data)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(rankings, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Saved {len(rankings)} teams to {output_path}")
    print("Example:")
    for row in rankings[:5]:
        print(f"  {row['worldRank']:>3}  {row['countryName']}  {row['flagUrl']}")


if __name__ == "__main__":
    main()

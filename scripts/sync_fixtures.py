#!/usr/bin/env python3
"""Sync PUBLIC Messi Cup 2026 match and club metadata from BuildUp.

No credentials, admin endpoints, or private footage are accessed.
Uses the public read-only entity responses powering stats.buildup.club.
"""
import json
import os
import re
import urllib.parse
import urllib.request
from pathlib import Path

APP = "6ad8b0035891124905a4079c"
BASE = f"https://stats.buildup.club/api/apps/{APP}/entities/"
OUT = Path("data/fixtures.json")
HEADERS = {"Accept": "application/json", "User-Agent": "SponsorStudio-FixtureSync/1.0"}

def public_list(entity):
    records = []
    seen = set()
    for offset in range(0, 501, 50):
        params = {"limit": "50", "skip": str(offset)}
        if entity == "Match":
            params["q"] = json.dumps({"date": {"$gte": "2026-01-01"}})
            params["sort"] = "order"
        else:
            params["sort"] = "name"
        url = BASE + entity + "?" + urllib.parse.urlencode(params)
        with urllib.request.urlopen(
            urllib.request.Request(url, headers=HEADERS), timeout=40
        ) as res:
            if res.status != 200:
                raise RuntimeError(f"Unexpected response status: {res.status}")
            payload = json.load(res)
        if isinstance(payload, dict):
            items = payload.get("items", [])
        elif isinstance(payload, list):
            items = payload
        else:
            raise ValueError("Unexpected BuildUp response structure")
        if not isinstance(items, list):
            raise ValueError("BuildUp payload did not contain a list")
        new = 0
        for item in items:
            if not isinstance(item, dict):
                continue
            ident = str(item.get("id", ""))
            if not ident or ident in seen:
                continue
            seen.add(ident)
            records.append(item)
            new += 1
        if len(items) < 50 or new == 0:
            break
    return records

def text(value, maximum=160):
    return str(value or "").strip()[:maximum]

def main():
    matches = public_list("Match")
    teams = public_list("Team")
    if len(matches) < 10 or len(teams) < 10:
        raise RuntimeError(f"Insufficient public feed data: {len(matches)} matches, {len(teams)} teams; keeping existing snapshot")

    teams_by_id = {t["id"]: t for t in teams if t.get("id")}
    club_records = []
    for t in teams:
        club_records.append({
            "id": text(t.get("id")),
            "name": text(t.get("name")),
            "logo": text(t.get("logo"), 500),
            "group": text(t.get("group")),
            "country": text(t.get("country")),
            "slug": text(t.get("slug")),
        })

    fixtures = []
    for m in matches:
        code = text(m.get("code"), 20)
        date = text(m.get("date"), 10)
        if not code or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
            continue
        home_team = teams_by_id.get(m.get("home_id"), {})
        away_team = teams_by_id.get(m.get("away_id"), {})
        home = text(m.get("home_label") or home_team.get("name") or m.get("home_source"))
        away = text(m.get("away_label") or away_team.get("name") or m.get("away_source"))
        home_score = m.get("home_score")
        away_score = m.get("away_score")
        score = ""
        if isinstance(home_score, (float, int)) and isinstance(away_score, (float, int)):
            score = f"{int(home_score)} : {int(away_score)}"
        fixtures.append({
            "id": code, "sourceId": text(m.get("id")),
            "date": date, "time": text(m.get("time"), 20),
            "home": home or "TBC", "away": away or "TBC",
            "homeId": text(m.get("home_id")), "awayId": text(m.get("away_id")),
            "homeLogo": text(home_team.get("logo"), 500),
            "awayLogo": text(away_team.get("logo"), 500),
            "score": score, "homeScore": home_score, "awayScore": away_score,
            "status": text(m.get("status")), "confirmed": bool(m.get("confirmed")),
            "group": text(m.get("group") or m.get("stage")),
            "stage": text(m.get("stage")), "round": text(m.get("round")),
            "cup": text(m.get("cup")), "venue": text(m.get("venue")),
            "order": m.get("order") if isinstance(m.get("order"), (float, int)) else 0,
        })
    if len(fixtures) < 10:
        raise RuntimeError("Parsed fewer than 10 fixtures; refusing to overwrite")
    fixtures.sort(key=lambda f: (f["date"], f["time"], f["order"], f["id"]))
    doc = {
        "source": "https://stats.buildup.club/matches",
        "timezone": "America/New_York",
        "season": 2026,
        "disclaimer": "Public BuildUp match metadata snapshot; not an official API integration or guaranteed real-time feed.",
        "clubs": club_records,
        "matches": fixtures,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Synced {len(fixtures)} fixtures from {len(club_records)} clubs. Dates: {', '.join(sorted(set(f['date'] for f in fixtures)))}")

if __name__ == "__main__":
    main()

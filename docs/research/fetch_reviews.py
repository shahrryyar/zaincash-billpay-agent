"""Fetch the 500 most recent public App Store (Iraq storefront) reviews per app.
Source: Apple's public iTunes customer-reviews RSS (no auth). Run: python3 -I fetch_reviews.py
Output: raw/appstore-iq-reviews-<date>.json. Keyword coding is crude; see 01-app-reviews.md.
"""
import json, urllib.request, datetime
APPS = {"1176557130": "ZainCash Iraq", "6450545056": "SuperQi"}
out = []
for app_id, name in APPS.items():
    for page in range(1, 11):
        url = f"https://itunes.apple.com/iq/rss/customerreviews/page={page}/id={app_id}/sortby=mostrecent/json"
        try:
            entries = json.load(urllib.request.urlopen(url, timeout=20)).get("feed", {}).get("entry", [])
        except Exception:
            break
        for e in ([entries] if isinstance(entries, dict) else entries):
            if "im:rating" in e:
                out.append({"app": name, "app_id": app_id, "stars": int(e["im:rating"]["label"]),
                            "date": e["updated"]["label"][:10], "title": e["title"]["label"], "text": e["content"]["label"]})
json.dump(out, open(f"raw/appstore-iq-reviews-{datetime.date.today()}.json", "w"), ensure_ascii=False)
print(len(out))

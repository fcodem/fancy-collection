#!/usr/bin/env python3
"""Smoke-test all main menu pages and key APIs (requires dev server on :3000)."""
import json
import urllib.request
import http.cookiejar

BASE = "http://localhost:3000"

PAGES = [
    "/", "/booking", "/search-booking", "/booking-delivery", "/remaining-to-deliver",
    "/return", "/booking-list", "/packing-list", "/free-items", "/inventory",
    "/inventory/search", "/all-record-search",
    "/finance/daily-sale", "/finance/daily-booking", "/finance/monthly-sale",
    "/finance/yearly-sale", "/finance/top-performer", "/finance/category-analysis",
    "/finance/security-deposit", "/finance/suppliers",
    "/customers", "/staff-attendance", "/staff-work", "/users",
    "/manage-categories", "/recycle-bin", "/reports",
    "/late-return", "/incomplete-return", "/returning-today",
    "/booking/new", "/profile/change-password",
]

APIS = [
    "/api/booking-list?delivery_date=2026-01-01&return_date=2026-12-31",
    "/api/packing-list?delivery_date=2026-01-01&return_date=2026-12-31",
    "/api/finance/daily-sale?date=2026-06-15",
    "/api/recycle-bin",
    "/api/users",
    "/api/categories",
    "/api/staff/attendance?date=2026-06-15",
]

def main():
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    login = json.dumps({"username": "owner", "password": "admin123"}).encode()
    req = urllib.request.Request(
        f"{BASE}/api/login", data=login,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        r = opener.open(req, timeout=30)
        body = json.loads(r.read())
        print("Login:", r.status, body)
    except Exception as e:
        print("LOGIN FAILED:", e)
        return

    fails = []
    for path in PAGES:
        try:
            r = opener.open(f"{BASE}{path}", timeout=60)
            code = r.status
            html = r.read(500).decode("utf-8", errors="replace")
            if code >= 400 or "Application error" in html or "Internal Server Error" in html:
                fails.append((path, code, "bad page"))
                print(f"FAIL PAGE {path} -> {code}")
            else:
                print(f"OK PAGE  {path} -> {code}")
        except Exception as e:
            fails.append((path, str(e)))
            print(f"ERR PAGE {path} -> {e}")

    for path in APIS:
        try:
            r = opener.open(f"{BASE}{path}", timeout=30)
            code = r.status
            raw = r.read()
            try:
                json.loads(raw)
                print(f"OK API   {path} -> {code}")
            except json.JSONDecodeError:
                fails.append((path, "non-json"))
                print(f"FAIL API {path} -> non-json ({raw[:80]!r})")
        except Exception as e:
            fails.append((path, str(e)))
            print(f"ERR API  {path} -> {e}")

    print(f"\nTotal failures: {len(fails)}")
    for f in fails:
        print(" ", f)

if __name__ == "__main__":
    main()

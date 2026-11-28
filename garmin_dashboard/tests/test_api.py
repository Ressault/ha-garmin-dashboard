"""API : chaque route principale répond, le code d'accès protège tout sauf l'état de santé."""

import os

import pytest
from fastapi.testclient import TestClient

ROUTES = [
    "/api/health", "/api/sync/status", "/api/activities?limit=5", "/api/fitness?days=30", "/api/predictions?days=30",
    "/api/thresholds", "/api/profile", "/api/health/details", "/api/plans", "/api/coach/estimate", "/api/coach/races",
    "/api/stats/weekly?weeks=4", "/api/stats/period?period=7d", "/api/stats/zones?days=28", "/api/stats/monthly?months=2",
    "/api/stats/effort?weeks=12", "/api/stats/efforts?sport=run", "/api/stats/records", "/api/auth/status",
]


@pytest.fixture()
def client(conn):
    import main

    with TestClient(main.app) as c:
        yield c


@pytest.mark.parametrize("path", ROUTES)
def test_route_answers_on_empty_database(client, path):
    assert client.get(path).status_code == 200


def test_no_cors_header(client):
    r = client.get("/api/health", headers={"Origin": "https://autre-site.example"})
    assert "access-control-allow-origin" not in r.headers


def test_access_code(client, monkeypatch):
    monkeypatch.setenv("ACCESS_CODE", "sésame-42")
    assert client.get("/api/profile").status_code == 401
    assert client.delete("/api/plans/1").status_code == 401
    assert client.get("/api/health").status_code == 200           # chien de garde de Home Assistant
    assert client.post("/api/auth/login", json={"code": "faux"}).status_code == 401
    assert client.post("/api/auth/login", json={"code": "sésame-42"}).status_code == 200
    assert client.get("/api/profile").status_code == 200           # le cookie ouvre l'accès
    monkeypatch.setenv("ACCESS_CODE", "autre-code")                # changer le code déconnecte l'appareil
    assert client.get("/api/profile").status_code == 401


def test_threshold_source_and_profile_note(client):
    assert client.put("/api/thresholds/source", json={"source": "nimporte"}).status_code == 400
    assert client.put("/api/thresholds/source", json={"source": "test"}).json()["source"] == "garmin"  # aucun test en base
    r = client.put("/api/profile", json={"coach_note": "surveiller l'asymétrie"})
    assert r.json()["coach_note"] == "surveiller l'asymétrie"


def test_races_roundtrip(client):
    r = client.put("/api/coach/races", json=[{"name": "Semi", "date": "2027-02-14", "km": 21.1}])
    assert r.status_code == 200 and r.json()["races"][0]["name"] == "Semi"
    assert client.put("/api/coach/races", json=[{"name": "X", "date": "14/02/2027"}]).status_code == 422

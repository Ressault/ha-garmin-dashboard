"""Synchro : un jour ou une sortie n'est marqué « synchronisé » que si les appels ont réussi."""

from datetime import date

import pytest

import db
import sync


class FakeGarmin:
    """Client Garmin factice : compte les appels, peut en faire échouer certains."""

    def __init__(self, fail=(), acts=None):
        self.fail, self.calls, self.acts = set(fail), [], acts or []

    def __getattr__(self, name):
        def call(*a, **k):
            self.calls.append(name)
            if name in self.fail:
                raise ConnectionError("réseau coupé")
            if name == "get_activities_by_date":
                return self.acts
            if name == "get_device_last_used":
                return {"lastUsedDeviceUploadTime": 1795849337000, "lastUsedDeviceName": "montre"}
            if name == "get_stats":
                return {"restingHeartRate": 50, "bodyBatteryMostRecentValue": 60, "wellnessEndTimeLocal": "2026-11-28T08:10:00.0"}
            if name == "get_sleep_data":
                return {"dailySleepDTO": {"sleepScores": {"overall": {"value": 80}}, "sleepTimeSeconds": 27000}}
            if name == "get_hrv_data":
                return {"hrvSummary": {"lastNightAvg": 55, "weeklyAvg": 56, "status": "BALANCED"}}
            if name == "get_activity":
                return {"summaryDTO": {"movingDuration": 3000}, "activityTypeDTO": {"typeKey": "running"}}
            if name == "get_activity_details":
                return {}
            return None

        return call


def act(aid=1, dist=10000.0):
    today = date.today().isoformat()
    return {"activityId": aid, "activityName": "Course", "activityType": {"typeKey": "running"},
            "startTimeLocal": f"{today} 08:00:00", "distance": dist, "duration": 3000.0}


def quiet(*a, **k):
    pass


def test_day_marked_synced_only_when_all_calls_succeed(conn):
    today = date.today().isoformat()
    sync.run_light_sync(client=FakeGarmin(fail={"get_heart_rates"}), log=quiet)
    assert conn.execute("SELECT health_synced FROM daily_health WHERE date = ?", (today,)).fetchone()[0] == 0
    sync.run_light_sync(client=FakeGarmin(), log=quiet)
    assert conn.execute("SELECT health_synced FROM daily_health WHERE date = ?", (today,)).fetchone()[0] == 1


def test_activity_detail_retried_after_failure(conn):
    sync.run_light_sync(client=FakeGarmin(fail={"get_activity_details"}, acts=[act()]), log=quiet)
    assert conn.execute("SELECT details_synced FROM activities WHERE activity_id = 1").fetchone()[0] == 0
    sync.run_light_sync(client=FakeGarmin(acts=[act()]), log=quiet)
    assert conn.execute("SELECT details_synced FROM activities WHERE activity_id = 1").fetchone()[0] == 1


def test_detail_downloaded_again_only_if_summary_changed(conn):
    sync.run_light_sync(client=FakeGarmin(acts=[act()]), log=quiet)
    same = FakeGarmin(acts=[act()])
    sync.run_light_sync(client=same, log=quiet)
    assert "get_activity_details" not in same.calls
    edited = FakeGarmin(acts=[act(dist=9500.0)])  # sortie rognée dans Garmin Connect
    sync.run_light_sync(client=edited, log=quiet)
    assert "get_activity_details" in edited.calls


def test_light_sync_skips_the_night_once_received(conn):
    sync.run_light_sync(client=FakeGarmin(), log=quiet)
    second = FakeGarmin()
    sync.run_light_sync(client=second, log=quiet)
    assert "get_hrv_data" not in second.calls
    assert len(second.calls) <= 9


def test_unreachable_garmin_raises_and_releases_the_lock(conn):
    with pytest.raises(sync.GarminUnreachable):
        sync.run_light_sync(client=FakeGarmin(fail={"get_activities_by_date"}), log=quiet)
    assert not sync.SYNC_LOCK.locked()
    assert conn.execute("SELECT COUNT(*) FROM sync_log").fetchone()[0] == 0


def test_last_measure_time_is_recorded(conn):
    sync.run_light_sync(client=FakeGarmin(), log=quiet)
    assert db.get_setting(db.connect(), "last_measure_at") == "2026-11-28T08:10:00"


def test_watch_upload_time_is_recorded_and_returned(conn):
    out = sync.run_light_sync(client=FakeGarmin(), log=quiet)
    assert out["watch_upload_at"] and out["watch_upload_at"].startswith("2026-11-28T")
    assert db.get_setting(db.connect(), "watch_upload_at") == out["watch_upload_at"]

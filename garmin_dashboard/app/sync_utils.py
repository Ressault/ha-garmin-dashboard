"""Synchro Garmin : petites aides communes.

Même philosophie que le serveur MCP : une donnée absente vaut None, jamais 0.
"""

from datetime import date, timedelta
from typing import Any, Callable, Optional


def num(value: Any, digits: Optional[int] = None) -> Optional[float]:
    if value is None or isinstance(value, bool):
        return None
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    return round(value, digits) if digits is not None else value


def pick(source: Any, *candidates: str) -> Any:
    if not isinstance(source, dict):
        return None
    for key in candidates:
        if source.get(key) is not None:
            return source[key]
    return None


def deep_find(obj: Any, *keys: str) -> Any:
    """Cherche récursivement la première clé présente (structures Garmin instables)."""
    if isinstance(obj, dict):
        for k in keys:
            if obj.get(k) is not None:
                return obj[k]
        for v in obj.values():
            found = deep_find(v, *keys)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for v in obj:
            found = deep_find(v, *keys)
            if found is not None:
                return found
    return None


def safe(label: str, errors: list, fn: Callable, *args, **kwargs) -> Any:
    try:
        return fn(*args, **kwargs)
    except Exception as exc:  # une erreur sur un endpoint ne bloque pas la synchro
        errors.append(f"{label}: {type(exc).__name__}: {exc}")
        return None


def downsample(items: list, max_items: int) -> list:
    if len(items) <= max_items:
        return items
    step = len(items) / max_items
    out = [items[int(i * step)] for i in range(max_items)]
    out[-1] = items[-1]
    return out


def daterange(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)

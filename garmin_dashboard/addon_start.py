"""Point d'entrée de l'add-on : lit les options Home Assistant puis lance l'API."""

import hashlib
import json
import os
from pathlib import Path

OPTIONS = Path("/data/options.json")
opts = json.loads(OPTIONS.read_text(encoding="utf-8")) if OPTIONS.exists() else {}

os.environ["GARMIN_EMAIL"] = (opts.get("garmin_email") or "").strip()
os.environ["GARMIN_PASSWORD"] = opts.get("garmin_password") or ""
os.environ["GARMIN_INITIAL_DAYS"] = str(opts.get("initial_sync_days") or 365)

# Jeton Garmin collé dans les options : copié une seule fois dans /data/garth (le client Garmin
# le rafraîchit ensuite lui-même ; un nouveau jeton collé plus tard remplace l'ancien).
token_dir = Path(os.environ["GARMINTOKENS"])
token_dir.mkdir(parents=True, exist_ok=True)
raw = (opts.get("garmin_tokens") or "").strip()
if raw:
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    marker = token_dir / ".imported"
    if not marker.exists() or marker.read_text() != digest:
        try:
            json.loads(raw)
        except ValueError:
            print("[addon] Le jeton Garmin collé n'est pas un JSON valide : ignoré.", flush=True)
        else:
            target = token_dir / "garmin_tokens.json"
            target.write_text(raw, encoding="utf-8")
            target.chmod(0o600)
            marker.write_text(digest)
            print("[addon] Jeton Garmin importé.", flush=True)

if not raw and not (token_dir / "garmin_tokens.json").exists() and not os.environ["GARMIN_EMAIL"]:
    print("[addon] Aucun jeton ni identifiant Garmin : renseigne-les dans la configuration de l'add-on.", flush=True)

os.execvp("uvicorn", ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"])

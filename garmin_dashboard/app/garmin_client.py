"""
Client Garmin authentifié — méthode identique à garmin-mcp/garmin_mcp_server.py :
`Garmin(email, password).login("~/.garth")` charge le jeton OAuth déjà présent
dans ~/.garth (et le rafraîchit), sinon se connecte avec GARMIN_EMAIL /
GARMIN_PASSWORD et réécrit le jeton.

Les identifiants peuvent aussi être placés dans un fichier .env à côté de ce
script (facultatif : avec un jeton valide dans ~/.garth, ils ne servent pas).
"""

import os
from pathlib import Path
from typing import Optional

from garminconnect import Garmin

TOKEN_DIR = Path(os.getenv("GARMINTOKENS", str(Path.home() / ".garth")))

try:  # .env facultatif
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

_CLIENT: Optional[Garmin] = None


def get_garmin_client() -> Garmin:
    global _CLIENT
    if _CLIENT is not None:
        return _CLIENT

    client = Garmin(
        email=os.getenv("GARMIN_EMAIL"), password=os.getenv("GARMIN_PASSWORD")
    )
    try:
        client.login(str(TOKEN_DIR))
    except Exception as exc:
        raise RuntimeError(
            f"Connexion à Garmin impossible : {exc}\n"
            "Relance installer.bat de garmin-mcp pour régénérer le jeton dans ~/.garth."
        ) from exc

    _CLIENT = client
    return client

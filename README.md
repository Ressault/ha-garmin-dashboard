# ha-garmin-dashboard

Add-on Home Assistant : tableau de bord sportif et santé Garmin (FastAPI + SQLite + React).

Installation : Paramètres → Applications → Boutique → ⋮ → Dépôts → ajouter l'adresse de ce dépôt GitHub.
Aucun identifiant ni donnée personnelle n'est stocké dans le code : ils se saisissent dans les options de l'add-on et dans le profil de l'appli.

- Documentation de l'add-on : `garmin_dashboard/DOCS.md`
- Changements par version : `CHANGELOG.md`

## Avant d'envoyer une version

```
cd garmin_dashboard
python -m pytest tests                      # calculs et API (base vide, aucun appel à Garmin)
python tests/smoke_pages.py http://127.0.0.1:4173   # chaque page s'ouvre, API coupée comprise
```

Chaque version est aussi posée sur une branche ou une étiquette git avant une refonte, pour pouvoir revenir en arrière.

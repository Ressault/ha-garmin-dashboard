# Journal des changements

## 1.2.2 — 28 novembre 2026

- Synchro : l'appli relève l'heure du dernier envoi de la montre à Garmin. Si une synchro ne peut rien ramener de neuf, elle le dit et indique quoi faire (ouvrir Garmin Connect sur le téléphone).

## 1.2.1 — 28 novembre 2026 · fin de l'audit

- Redites : une page de référence par indicateur. FC au repos et VO₂ max sur Forme, VFC sur Sommeil, charge (forme, fatigue, fraîcheur) sur Entraînement. Synthèse et Mes piliers ne gardent qu'un chiffre par indicateur, avec un renvoi.
- Couleurs : plus aucune couleur écrite dans les fichiers d'interface. Tout passe par les jetons de `index.css` (clair et sombre) ; `lib/palette.ts` n'en contient plus.
- Fichiers découpés par thème : `sync.py` (5 fichiers), `ui/charts/` (6), `views/activite/` (5), `views/longevite/` (4). Les fonctions de synchro sont identiques, seulement déplacées.

## 1.2.0 — 28 novembre 2026 · application de l'audit complet

Version de retour arrière : branche `sauvegarde-v1.1.47-avant-audit`.

### Chiffres justes
- Records : une fenêtre qui traverse un passage impossible (plus de 6,5 m/s à pied, deux points de suite ou plus de 30 m) est écartée. Les faux records de la sortie du 16 août disparaissent ; un à-coup isolé du GPS reste toléré.
- Graphique des records : chaque point et chaque médaille est posé sur le temps réel de la sortie. La courbe est une tendance, légendée.
- Sommeil : « Réveils : trop nombreux » au lieu de « Éveil : faible ». Détail d'une sortie : « tour » au lieu de « km » quand ce sont des tours.
- Volume : temps hors pauses, distance à pied seule (plus d'addition vélo + course), ligne « Autre » pour natation et escaliers.
- Allures au même format partout (4:35 /km), « BPM » partout.

### Pannes visibles
- État d'erreur commun avec « Réessayer » sur toutes les pages ; plus aucun zéro affiché pour une donnée absente.
- Heure réelle de la dernière synchro réussie et de la dernière donnée de la montre ; « Mesuré à » sur la Body Battery et le cœur.
- Synchro en panne : indiquée dans l'appli, notification Home Assistant après 3 échecs, reconnexion automatique à Garmin.

### Sécurité
- Réglage CORS retiré. Code d'accès facultatif (option `access_code` de l'add-on), demandé une fois par appareil.
- Textes personnels sortis du code : ils se saisissent dans le profil (« Points à surveiller »).

### Synchro sobre
- Un jour ou une sortie n'est marqué « synchronisé » que si les appels ont réussi ; les jours incomplets sont complétés (20 par synchro complète).
- Le détail d'une sortie n'est retéléchargé que si son résumé a changé. Synchro légère toutes les 30 min (sauf la nuit), complète toutes les 6 h.
- PC : une seule synchro au lancement (`GARMIN_AUTO_SYNC=startup` dans start.bat).

### Aide à la décision
- Test de seuil de 30 min reconnu, avec allure et FC seuil ; bouton pour l'adopter comme repère.
- Estimation du semi tirée des records récents (Riegel), à côté de celle de la montre.
- Programme : une séance courue la veille ou le lendemain compte ; courses objectif (« Mes courses ») signalées quand le programme ne les prévoit pas.
- Préparation du jour : score Garmin et temps de récupération au premier plan.

### Vitesse
- Requêtes partagées et gardées 60 s ; dernière réponse gardée sur le téléphone (appli ouvrable hors ligne).
- Réfraction réservée à la barre du bas ; cœur fixe après 3 battements ; transitions raccourcies.

### Lisibilité
- Contrastes des textes (Programme, Sommeil, Forme), légendes des graphiques, zones tactiles de 44 px, titres de page, sections Puissance, Dynamiques et Tours repliées.

### Garde-fous
- 44 tests sur les calculs et l'API (`python -m pytest tests`), test « chaque page s'ouvre » (`tests/smoke_pages.py`).
- Code mort supprimé (6 composants, dépendance @tremor/react).

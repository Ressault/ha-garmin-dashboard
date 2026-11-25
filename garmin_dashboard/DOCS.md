# Garmin Dashboard

## Connexion à Garmin

Deux façons, la première est la plus simple si ton compte demande un code de validation :

1. **Jeton (recommandé)** : sur ton PC, ouvre `C:\Users\<toi>\.garth\garmin_tokens.json` avec le Bloc-notes, copie tout le contenu et colle-le dans l'option **garmin_tokens**.
2. **Identifiants** : renseigne **garmin_email** et **garmin_password**. Ça ne marche que si Garmin ne demande pas de code de validation.

Au premier démarrage, l'add-on importe `initial_sync_days` jours d'historique (365 par défaut), puis se resynchronise tout seul : une synchro légère toutes les 20 minutes (Body Battery, disponibilité, nouvelles sorties) et une synchro complète toutes les heures.

## Accès depuis le téléphone (privé)

L'interface écoute sur le port 8000. Avec l'add-on **Tailscale** déjà installé sur Home Assistant et l'appli Tailscale sur ton téléphone, ouvre `http://<adresse Tailscale de Home Assistant>:8000`, puis « Ajouter à l'écran d'accueil ».
Ne redirige jamais ce port sur ta box : l'app n'a pas de mot de passe.

## Données

La base SQLite et le jeton sont dans `/data` : ils sont inclus dans les sauvegardes Home Assistant.

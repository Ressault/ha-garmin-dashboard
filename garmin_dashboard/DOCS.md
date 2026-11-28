# Garmin Dashboard

## Connexion à Garmin

1. **Jeton (recommandé)** : sur ton PC, ouvre `C:\Users\<toi>\.garth\garmin_tokens.json` avec le Bloc-notes, copie tout le contenu et colle-le dans l'option **garmin_tokens**.
2. **Identifiants** : renseigne **garmin_email** et **garmin_password**. Ça ne marche que si Garmin ne demande pas de code de validation. Avec un jeton, laisse **garmin_password** vide : il ne sert pas.

Au premier démarrage, l'add-on importe `initial_sync_days` jours d'historique (365 par défaut), puis se resynchronise tout seul : une synchro légère toutes les 30 minutes entre 6 h et minuit (Body Battery, disponibilité, nouvelles sorties) et une synchro complète toutes les 6 heures. L'appli affiche l'heure de la dernière synchro réussie ; après 3 échecs de suite, une notification apparaît dans Home Assistant.

## Code d'accès

Sans code, tout appareil de ton réseau peut ouvrir l'appli. Choisis un code dans l'option **access_code**, enregistre, redémarre l'add-on : chaque appareil le demande une fois, puis le retient un an. Pour déconnecter tous les appareils, change le code. Si tu l'oublies, il se relit dans cette même option.

## Accès depuis le téléphone (privé)

L'interface écoute sur le port 8000. Avec l'add-on **Tailscale** et l'appli Tailscale sur ton téléphone, ouvre l'adresse Tailscale de l'appli, puis « Ajouter à l'écran d'accueil ».
Ne redirige jamais ce port sur ta box.

## Données

La base SQLite et le jeton sont dans `/data` : ils sont inclus dans les sauvegardes Home Assistant.
Les fonds de carte viennent d'OpenStreetMap : leurs serveurs voient la zone des sorties que tu ouvres.

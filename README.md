# Études

Application locale de gestion d'études : arborescence année → semestre → matière → chapitre, notes en Markdown, évaluations liées aux chapitres, emploi du temps et tableau de bord.

## Prérequis
- Node.js 20+
- PostgreSQL 13+ (pour `gen_random_uuid()`)

## Installation
1. **Installer PostgreSQL** : https://www.postgresql.org/download/ (ou `brew install postgresql@16`, `sudo apt install postgresql`).
2. **Créer la base** :
   ```bash
   createdb etudes
   # ou : psql -U postgres -c "CREATE DATABASE etudes;"
   ```
3. **Configurer l'environnement** :
   ```bash
   cp .env.example .env   # puis adapter DATABASE_URL (utilisateur / mot de passe)
   ```
4. **Installer les dépendances** : `npm install`
5. **Lancer les migrations** : `npm run migrate`
6. **Démarrer** : `npm run dev`
   - Client : http://localhost:5173
   - API : http://localhost:3001/api/health

## Scripts
| Commande | Rôle |
|---|---|
| `npm run dev` | Lance serveur et client |
| `npm run migrate` | Applique les migrations SQL (`server/src/migrations/NNN_*.sql`) |
| `npm run seed` | Données de démonstration (si la base est vide) |
| `npm run typecheck` | Vérifie les types des deux workspaces |

## Ajouter une migration
Créer `server/src/migrations/002_nom.sql` : les fichiers sont appliqués dans l'ordre, une seule fois.

## Emploi du temps et import .ics
La page « Emploi du temps » affiche une semaine (lundi à dimanche). Le bouton « Importer un .ics » envoie le fichier à `POST /api/calendar/import` :
- les événements sont dédoublonnés par `ics_uid` : réimporter le même fichier ne crée rien en double ;
- les séries récurrentes (RRULE, EXDATE) sont dépliées de 90 jours avant à 400 jours après aujourd'hui ;
- la matière rattachée à la main est conservée lors d'une réimportation ;
- l'icône corbeille supprime uniquement les événements importés.

### Calendriers en ligne (abonnement par URL)
« Calendriers en ligne » (page Emploi du temps) permet de s'abonner à l'adresse `.ics` d'un calendrier (`https://…` ou `webcal://…`) :
- le serveur télécharge le flux avec `ical.fromURL()` (délai de 20 s) ; une adresse injoignable ou qui ne renvoie pas un calendrier est refusée et rien n'est créé ;
- la synchronisation est automatique au démarrage puis toutes les `CALENDAR_SYNC_MINUTES` minutes (60 par défaut, `0` pour la désactiver), ou à la demande avec le bouton ↻ ;
- à chaque synchronisation, les événements supprimés à la source disparaissent **à partir d'aujourd'hui** ; le passé est conservé. Un flux vide ne supprime rien ;
- supprimer un abonnement propose de garder ou de supprimer ses événements ;
- le serveur effectue lui-même la requête vers l'adresse saisie : l'application est prévue pour un usage local mono-utilisateur.

## Tableau de bord et recherche
- **Tableau de bord** (`GET /api/dashboard`) : semaine en cours, prochaines évaluations avec progression, chapitres modifiés récemment, moyennes.
- **Moyennes** : par matière = moyenne des notes pondérée par le coefficient de chaque évaluation (un coefficient absent compte pour 1). Moyenne générale = moyenne des matières notées pondérée par leur coefficient (absent = 1). Les matières sans note sont ignorées. Un sélecteur d'année apparaît s'il y en a plusieurs.
- **Recherche** : `Ctrl/Cmd + K` (ou le champ en haut de la barre latérale), construite avec `cmdk`. Elle ignore la casse et les accents, et déplie l'arbre jusqu'à l'élément choisi.

## Apparence et mobile
- **Thème** : clair, sombre ou « système » (par défaut, suit l'OS en direct). Le bouton de la barre latérale (ou de la barre du haut sur mobile) fait défiler les trois modes ; le choix est conservé. Le thème est appliqué avant le premier rendu, sans flash blanc.
- **Mobile** (< 768 px) : la barre latérale devient un tiroir ouvert par le bouton menu ; il se referme après chaque navigation. Les boutons d'action de l'arbre sont toujours visibles sur écran tactile. La grille de la semaine défile horizontalement dans son cadre.
- **Erreurs** : un serveur injoignable, une page ou un élément introuvable et une erreur d'affichage ont chacun un message clair (avec « Réessayer » quand c'est utile) ; aucune erreur ne laisse une page blanche.
- **Première utilisation** : sur une base vide, le tableau de bord propose de créer l'année en cours avec ses semestres S1 et S2 en un clic.

## Dépannage
- *« Impossible de joindre le serveur »* : l'API n'est pas lancée ou `DATABASE_URL` est incorrect (voir la sortie de `npm run dev`).
- *Repartir de zéro* : `psql "$DATABASE_URL" -c "TRUNCATE years, calendar_events, calendar_sources CASCADE"` puis `npm run seed`.

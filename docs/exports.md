# Exporter des cours et ses données

## Interface

- Dans un chapitre, choisir Markdown ou PDF à côté du bouton **Exporter**.
- Dans la barre latérale, **Exporter des cours…** ouvre une sélection multiple.
  Cocher des chapitres, cours/matières, semestres et/ou années, puis MD, PDF ou
  les deux. La sélection est l'union des descendants : un chapitre n'est jamais
  exporté deux fois lorsque ses parents sont aussi cochés.
- Dans **Profil → Exporter mes données**, retrouver cette sélection ainsi que
  **Tout télécharger (.zip)** et **Base portable (.db)**.
- Les modifications encore dans le délai de sauvegarde de l'éditeur sont envoyées
  avant de démarrer l'export. Un échec de sauvegarde empêche le téléchargement.

## Contenu et portabilité

ZIP de sélection : un fichier par chapitre et par format, classé sous
`cours/année/semestre/matière/chapitre`, plus `manifest.json` et `LIRE-MOI.txt`.
Chaque segment porte un libellé raccourci et l'UUID complet encodé en base 32
minuscule, pour limiter la longueur des chemins et éviter les collisions sous
Windows, y compris pour deux titres identiques. Le manifeste restitue les UUID,
titres et chemins. Une année sans chapitre produit un ZIP avec manifeste ; elle
ne produit pas de PDF vide. Les structures sans chapitre ne deviennent pas des
fichiers de cours.

ZIP complet : mêmes fichiers de cours, tous en MD **et** PDF, plus `data.json`.
Ce JSON est l'instantané relationnel complet, versionné (`version: 4`), avec :

- profil et dates du compte ;
- années, semestres, matières, chapitres (contenu, statut, position et dates) ;
- évaluations, notes, coefficients et liens évaluation/chapitre ;
- événements et abonnements calendaires, état de synchronisation compris ;
- métadonnées des sessions (appareil, IP, dates), sans jeton d'authentification.

Le `.db` est une **vraie base SQLite autonome**, et non du JSON renommé ou un
fichier PostgreSQL. Il contient les mêmes tables et données que `data.json`,
les clés primaires/étrangères, et une table `export_metadata`. UUID et dates ISO
sont en TEXT, notes et coefficients en REAL, positions/compteurs en INTEGER.
`PRAGMA user_version` vaut 4. Il s'ouvre dans un client SQLite ; un fournisseur
cible devra mapper ce schéma vers son propre modèle. Il ne s'agit pas d'un dump
PostgreSQL et il n'existe pas encore de restauration automatique dans Studier.
Les fonctions, index et triggers internes de PostgreSQL ne sont pas exportés.
Les réglages locaux du navigateur (thème, volets dépliés) ne sont pas dans la
base serveur et ne font pas partie de cet export.

Ni hash de mot de passe, ni hash de jeton de session, ni secret `.env` ne sont
exportés. Les abonnements peuvent contenir des URL privées : conserver les
archives comme des données personnelles. Les images distantes ne sont pas
copiées ; leurs URL restent dans le Markdown et dans les descriptions du PDF.

## Rendu PDF

PDF A4 textuel avec titres, paragraphes, listes, code monospacé, tables présentées
en blocs et polices DejaVu embarquées (licence dans `server/assets/fonts`). Les
accents français, de nombreux signes IPA et grecs sont pris en charge par ces
polices. Ce n'est pas une reproduction exacte de l'éditeur : le gras, les couleurs de la palette et le surlignage sont conservés ;
l’italique et le barré restent aplatis. Le HTML non reconnu et les formules LaTeX restent en texte source ; les images importées sont incorporées et les courbes `plot` tracées. Les images
distantes restent décrites avec leur URL. Aucun navigateur, téléchargement d'image, appel
externe ou exécution de HTML n'est nécessaire à la génération.

## API

Toutes les routes exigent la session existante. Aucun `user_id` client n'est
accepté. Un élément absent ou appartenant à un autre compte renvoie 404.

- `GET /api/exports/chapters/:id/md`
- `GET /api/exports/chapters/:id/pdf`
- `POST /api/exports` pour une sélection :

```json
{
  "kind": "selection",
  "formats": ["md", "pdf"],
  "roots": [{ "level": "years", "id": "UUID_DE_L_ANNEE" }]
}
```

Les niveaux sont `years`, `semesters`, `subjects`, `chapters` et peuvent se
mélanger. Au moins un élément et un format sont requis.

- `POST /api/exports` avec `{"kind":"complete","format":"zip"}`
- `POST /api/exports` avec `{"kind":"complete","format":"db"}`

Les réponses sont des pièces jointes avec `Cache-Control: no-store`. Les lectures
utilisent une transaction PostgreSQL `REPEATABLE READ READ ONLY` et les filtres
d'appartenance sur chaque table. Les exports de sélection ne lisent que les
contenus des chapitres concernés. La transaction est fermée avant la génération
des fichiers. L'export ne change aucune donnée.

## Limites explicites

Cette version génère les fichiers en mémoire. Les limites évitent de saturer le
processus et ne tronquent jamais silencieusement les données :

- maximum 5 000 racines sélectionnées ;
- maximum 50 000 lignes par table, 100 000 lignes et 128 Mio de JSON de données au total ;
- maximum 1 Mio de Markdown par chapitre pour le PDF ;
- maximum 200 chapitres dès qu'un ZIP contient du PDF, y compris un ZIP complet ;
- maximum 16 Mio par PDF et 256 Mio de fichiers avant compression ZIP ;
- un export à la fois par utilisateur, deux par processus serveur ;
- 15 secondes maximum par requête SQL.

Un dépassement de volume renvoie 413, une génération déjà en cours 429. Pour un
compte de plus de 200 chapitres, utiliser le `.db` pour l'ensemble des données et
des ZIP PDF par sélections. Le `.db` reste soumis à la limite de données de 128 Mio.
La concurrence est limitée par processus, pas par un verrou distribué. Pour des
volumes supérieurs, prévoir des tâches asynchrones et un stockage temporaire avec
génération en flux ; cette série ne fournit pas cette infrastructure.

## Installation et vérification (PowerShell ou CMD, racine du projet)

```text
npm ci
npm run typecheck
npm test -w client
npm test -w server -- exports.test.ts
npm run build -w client
npm run dev
```

La migration 007 est requise pour les images. PostgreSQL et les migrations existantes doivent déjà
être prêts. Les tests serveur utilisent **TEST_DATABASE_URL** et réinitialisent
cette base : utiliser une base isolée dont le nom contient `test`, distincte de
DATABASE_URL, conformément au dispositif déjà présent.

Vérifications manuelles :

1. Modifier un chapitre et exporter immédiatement : les dernières frappes figurent
   dans le MD ou le PDF, sans attendre une seconde.
2. Cocher une année et un de ses chapitres : une seule copie par format.
3. Exporter deux chapitres homonymes : deux chemins distincts dans le ZIP.
4. Exporter une année vide : ZIP valide avec manifeste et sélection explicite.
5. Dans Profil, exporter le ZIP complet : contrôler les fichiers MD/PDF et data.json.
6. Ouvrir le `.db` dans un client SQLite et exécuter :

```sql
PRAGMA integrity_check;
PRAGMA foreign_key_check;
SELECT title, content_md FROM chapters;
SELECT * FROM evaluations;
SELECT * FROM evaluation_chapters;
```

`integrity_check` doit renvoyer `ok`, `foreign_key_check` aucune ligne.

## Validation de la série

- Vérification TypeScript serveur et client : réussie.
- Compilation Vite de production : réussie (avertissement existant de bundle volumineux).
- 15 tests serveur : génération PDF, pagination, limites, routes authentifiées,
  absence/fuite inter-comptes, validation, sélection aux quatre niveaux,
  déduplication, chemins, année vide, limite de concurrence, ZIP complet,
  intégrité SQLite, données et relations, compte vide.
- Exécutés ici avec le moteur PostgreSQL embarqué PGlite et un adaptateur de test
  du pool ; les cinq migrations existantes ont été appliquées. Aucun serveur
  PostgreSQL réseau n'était disponible. L'adaptateur temporaire n'est pas livré :
  les tests livrés utilisent le PostgreSQL habituel du projet avec la commande
  ci-dessus. Le protocole réseau et les services Windows restent à vérifier localement.
- 4 tests client : envoi immédiat des dernières frappes, export global,
  blocage sur échec de sauvegarde, attente d'un envoi déjà en cours.
- Un PDF d'exemple a été rendu puis inspecté visuellement, et son texte extrait.
- Pas de validation de l'interface dans un navigateur dans cet environnement.

## Tableaux blancs, images et révisions (format v4)

Les exports comprennent désormais la table whiteboards et les scènes .excalidraw.
Le détail du format et de la sélection est décrit dans [le guide diagrammes](diagrams-whiteboards.md).
Les diagrammes Mermaid restent en source dans le PDF textuel.

Les images et courbes `plot` sont détaillées dans [le guide images et fonctions](images-functions.md).

La palette et le surlignage sont détaillés dans [le guide de mise en forme](text-formatting.md).

Les exports complets v4 comprennent aussi la table reviews, les points de départ
des chapitres et les paramètres du modèle estimatif. Voir [les révisions espacées](spaced-reviews.md).

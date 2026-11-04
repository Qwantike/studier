# Courbe de l’oubli et révisions espacées

## Installation

Cette série se base sur `studier-dev-titiplex(1).zip`. Après application des commits :

```text
npm ci
npm run migrate
npm run lint
npm run typecheck
npm test -w client
npm test -w server
npm run build -w client
npm run dev
```

La migration `008_reviews.sql` est nécessaire. Les migrations précédentes restent
inchangées. Aucune dépendance ni variable d’environnement supplémentaire.
Les tests serveur utilisent le dispositif habituel `TEST_DATABASE_URL`, qui remet
le schéma de test à zéro : cette base doit être isolée des données réelles.

## Utilisation

- Dans chaque chapitre : **Révisions et mémoire**, rétention estimée, projection
  sans nouvelle révision sur 7/30/90 jours, prochain rappel et historique.
- Après avoir essayé de restituer le chapitre sans les notes, choisir **À revoir**,
  **Difficile**, **Réussi** ou **Facile**. Ce sont des auto-évaluations, pas des notes
  d’examen et pas une correction automatique de la réponse.
- La navigation **Révisions** ouvre **À réviser aujourd’hui**. Les rappels déjà
  échus et ceux prévus plus tard dans la journée sont distingués. Le tableau de
  bord affiche un résumé avec les trois premiers rappels.
- **Tous les chapitres** permet de démarrer un chapitre ou de retrouver son suivi.
  Filtres par matière et par évaluation, 50 résultats par page, ordre stable.
- Une page d’évaluation propose **Plan de révision des chapitres associés**.
- Le suivi et les listes sont relus toutes les minutes et au retour dans l’onglet.

Les dernières frappes de l’éditeur sont capturées et sauvegardées avant la notation.
Une sauvegarde impossible bloque l’action. Cette capture corrige aussi le décalage
entre la notification différée de Milkdown et les exports immédiats.

## Statuts et démarrage

Un nouveau chapitre **Non commencé** ne reçoit aucun rappel. Au premier passage
manuel à un statut appris, la date de départ du suivi et une stabilité initiale
sont fixées une seule fois :

| Statut  | Stabilité initiale S |
| ------- | -------------------: |
| Vu      |              2 jours |
| Compris |              5 jours |
| Révisé  |             10 jours |

Changer ensuite le titre, les notes ou le statut ne renouvelle pas ce point de
départ et ne crée aucune révision fictive. Une réussite (`Difficile`, `Réussi`,
`Facile`) met le statut à **Révisé**. Un échec initial fait passer **Non commencé**
à **Vu** ; un échec ultérieur conserve le statut de travail déjà choisi.

Repasser à **Non commencé** suspend les rappels sans effacer l’historique. Une
nouvelle auto-évaluation réactive le suivi. Le statut décrit le travail effectué,
pas une garantie de maîtrise ou un score de rétention.

Les chapitres déjà appris avant la migration gardent une date d’apprentissage
**inconnue** : premier rappel immédiat, sans pourcentage fictif. Leur première
auto-évaluation établit le point de départ. Les nouveaux points de départ manuels
restent identifiés comme n’ayant aucune révision enregistrée.

## Modèle v1 : estimation, pas mesure de la mémoire

La rétention affichée est `R = exp(-t / S)`, avec `t` en jours de 24 heures depuis
le dernier essai ou le point de départ explicite et `S` la stabilité estimée.
Le rappel du modèle est fixé au passage sous **80 %**, soit `-S * ln(0.8)` jours.

Pour une première auto-évaluation sans stabilité préalable :

| Auto-évaluation | S initial |
| --------------- | --------: |
| À revoir        |    1 jour |
| Difficile       |   2 jours |
| Réussi          |   5 jours |
| Facile          |   8 jours |

Après un échec, S revient à 1 jour (rappel dans environ 5 h 21 min). Après une
restitution réussie, les facteurs maximaux sont respectivement 1,2 / 2 / 2,5.
La croissance est pondérée par l’espacement réel :

```text
espacement = min(1, max(0, temps écoulé / intervalle précédent))
S suivant = min(3650, max(1, S précédent * (1 + (facteur - 1) * espacement)))
```

Répéter immédiatement ne multiplie donc pas artificiellement S. La borne haute
est 3 650 jours. Ces paramètres sont fixes, transparents et exportés ; ils ne
sont ni appris sur chaque personne ni validés pour prédire une performance réelle.
Ce modèle simple n’est pas SM-2 ou FSRS.

**Le modèle repart de 100 % après chaque essai, même raté.** Ce 100 % représente
le début d’une nouvelle courbe, pas une maîtrise démontrée. La courbe du chapitre
est une **projection future sans nouvelle révision**, et non une mesure de la
mémoire ni un graphique historique de résultats. L’historique daté est présenté
séparément (les 50 derniers essais ; tout l’historique est exporté).

## Évaluations et jours locaux

La prochaine évaluation liée, non passée, peut avancer le rappel à la veille.
Une révision effectuée ce jour-là satisfait ce rappel de préparation ; le jour
même de l’évaluation, un nouveau rappel est proposé en l’absence d’essai du jour.
Cela ne change ni S ni R. Une échéance du modèle plus proche reste prioritaire.
Les évaluations des sept prochains jours départagent les rappels dans la liste.
Les autres dates restent visibles sans passer systématiquement devant les retards.

Les dates d’évaluation ne précisent pas d’heure : cette préparation fonctionne
par jour civil, pas par heure de début d’examen. Seule la prochaine évaluation
liée intervient dans cette version. Modifier/supprimer les liens ou dates
recalcule le rappel à la prochaine lecture. Les compteurs existants de préparation
par statut restent disponibles ; ils ne mesurent pas la rétention.

Le navigateur transmet son fuseau IANA (`Europe/Paris`, etc.), validé par le
serveur. « Aujourd’hui » suit ce fuseau, y compris au changement d’heure. Le
temps écoulé du modèle reste une durée réelle, sans compter les jours civils.
L’horodatage des révisions vient du serveur ; le client ne peut pas antidater,
postdater, imposer S ou changer d’utilisateur dans le corps de la requête.

## Données, API et cohérence

`reviews` conserve `id`, `user_id`, `chapter_id`, `reviewed_at`, `rating`,
`stability_days`, `ordinal` et `model_version`. La clé étrangère composite empêche
les références entre comptes. Les suppressions de chapitre ou de compte effacent
les révisions correspondantes. Les points de départ résident dans les deux
nouvelles colonnes `chapters.review_started_at` et `initial_stability_days`.

- `GET /api/reviews?timezone=Europe/Paris&scope=today` : file paginée et compteurs.
  Options : `scope=all`, `subject_id`, `evaluation_id`, `offset`, `limit` (1–100).
- `GET /api/chapters/:id/reviews?timezone=Europe/Paris` : estimation et historique.
- `POST /api/chapters/:id/reviews` avec `{ "id": "UUID", "rating": "good" }`.
  Choix : `again`, `hard`, `good`, `easy`. Création 201, rejeu identique 200,
  réutilisation incompatible de l’identifiant 409.

Toutes ces routes exigent la session existante et renvoient des réponses sans
cache. Les éléments d’un autre compte sont invisibles (404). Un verrou du
chapitre sérialise les insertions, et un ordinal départage même les dates égales.
Un nouvel essai du même bouton après une erreur conserve l’identifiant de requête.
L’historique est en lecture seule dans cette première version (pas de modification
ou suppression isolée d’un essai). Limite : 120 enregistrements/heure/compte.

La file traite au maximum 5 000 chapitres par requête, sans charger le Markdown ni
l’ensemble de l’historique. Au-delà, une erreur explicite demande un filtre par
matière ou évaluation. La recherche du dernier essai est indexée par chapitre.

## Exports et vérification

Les exports complets JSON, ZIP et SQLite passent en **version 4**, avec la table
`reviews` et les points de départ. Le modèle est dans `data.json.review_model`
et dans `export_metadata.review_model` du SQLite. Les MD/PDF de sélection restent
les documents de cours ; ils n’incluent pas une copie de l’historique de révisions.
Les plafonds de volume existants des exports restent applicables.

Vérifications réalisées : 74 tests client et 107 tests serveur ciblés (auth,
exports, tableaux blancs, images, mise en forme et révisions), TypeScript,
ESLint, compilation Vite et parcours navigateur avec sauvegarde juste après la
dernière frappe, historique/rechargement, échec, filtres, préparation d’évaluation,
tableau de bord, écran mobile sombre et export complet.

Les tests serveur ont été exécutés avec PostgreSQL embarqué PGlite et les huit
migrations. L’adaptateur temporaire n’est pas livré ; les tests du dépôt restent
branchés sur sa base PostgreSQL isolée habituelle. Le protocole réseau PostgreSQL
et Windows restent à vérifier localement.

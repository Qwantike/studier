# Dashboard gamifié facultatif

Le dashboard ajoute « Mon parcours d’étude », après le système de rappels déjà présent dans cette version. Il est masqué par défaut. Le bouton « Afficher mon parcours » l’active ; « Masquer mon parcours » retire les statistiques. La préférence et l’objectif sont enregistrés par compte et partagés entre appareils.

## Ce qui compte

- Une activité est un rappel explicitement enregistré via les boutons de révision d’un chapitre. Tous les résultats comptent, y compris « À revoir » : le suivi valorise la pratique, pas la réussite.
- Lire une page, modifier une note ou changer manuellement un statut ne crée pas d’activité. Il n’est pas possible d’envoyer une date d’activité arbitraire par API.
- `study_activity` conserve le chapitre et l’instant UTC. Un trigger PostgreSQL écrit l’événement dans la transaction qui crée la révision. Sa clé reprend l’identifiant de révision : les rejeux HTTP idempotents ne multiplient pas les événements.
- La migration 009 reprend les révisions existantes avec leur date réelle. Elle n’invente pas d’activité à partir de `updated_at` ou d’un statut appris.
- Les libellés et matières de l’historique suivent les noms et rattachements actuels des chapitres. Les 20 derniers rappels sont affichés.

## Calculs

| Indicateur              | Définition                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| Jour d’étude            | Au moins un rappel sur une date locale, dans le fuseau de l’appareil                                           |
| Série actuelle          | Jours locaux consécutifs ; la série peut finir aujourd’hui ou hier pour laisser la journée en cours disponible |
| Meilleure série         | Plus longue suite de dates locales avec activité                                                               |
| Objectif hebdomadaire   | De 1 à 7 jours, 3 par défaut ; semaine du lundi au dimanche, jamais semaine glissante                          |
| Progression par matière | Chapitres au statut actuel « Révisé » / nombre de chapitres de la matière                                      |
| Couverture des rappels  | Chapitres ayant au moins un rappel enregistré, indépendamment de leur statut                                   |
| Badges                  | Premier rappel, 3 jours consécutifs, 7 jours consécutifs, 50 rappels                                           |

Plusieurs rappels dans la même journée n’ajoutent qu’un jour aux séries et à l’objectif. Les compteurs de rappels comptent les événements, pas des séances chronométrées. La progression par matière n’est pas une estimation de maîtrise ni le pourcentage de rétention du modèle de révision.

Les compteurs concernent toutes les années et matières du compte. Le sélecteur d’année des moyennes du dashboard ne les filtre pas. Le fuseau est fourni par l’appareil ; voyager ou changer ce fuseau peut modifier le regroupement historique des dates. Les dates futures sont exclues.

Les badges sont recalculés depuis l’historique disponible, sans table d’attributions définitives. Supprimer un chapitre, une matière ou une année supprime également les rappels et événements correspondants : les compteurs et badges peuvent donc diminuer. Supprimer le compte supprime aussi ses préférences et événements.

## Affichage et confort

L’affichage est volontaire, sans classement, pénalité, compte à rebours ou notification de série perdue. Le texte rappelle que les pauses font partie de l’apprentissage. L’objectif est modifiable à tout moment et prend effet sur la semaine courante.

Masquer le parcours ne désactive pas le journal des rappels : il reste lié à l’historique de révision. Quand le parcours est masqué, `GET /api/study` renvoie uniquement les préférences et n’effectue pas les agrégations. Ce choix concerne la présentation ; il ne constitue pas une commande d’effacement des données.

## API et stockage

- `GET /api/study?timezone=Europe%2FParis` : préférences, puis statistiques si activées. UTC par défaut, fuseau validé, paramètres supplémentaires refusés.
- `PATCH /api/study/preferences` : objet partiel non vide, par exemple `{"enabled":true,"weekly_days":4}`. Objectif entier entre 1 et 7, booléen strict, champs supplémentaires refusés.
- Les deux routes exigent une session et utilisent exclusivement son utilisateur. Le mécanisme CSRF existant s’applique à la mutation. Réponses `Cache-Control: no-store`.
- Les statistiques sont lues dans une transaction cohérente `REPEATABLE READ`. Les préférences sont mises à jour par upsert atomique et les champs omis sont conservés.
- Index par compte/date et par compte/chapitre/date. Le navigateur rafraîchit toutes les minutes, au retour au premier plan et après les mutations concernées.
- Les exports complets JSON et SQLite incluent `study_activity` et `study_preferences`. Le format d’export passe de 4 à 5, y compris les métadonnées SQLite. Les booléens y sont encodés en 0/1. Les exports de sélections gardent leur portée actuelle et n’incluent pas les statistiques globales du compte.

## Mise en service

Aucune dépendance ni variable d’environnement supplémentaire. Appliquer les patchs dans l’ordre du guide fourni. Conserver le `.env` existant.

1. Sauvegarder la base et arrêter l’API pendant le déploiement, particulièrement si l’historique est volumineux : la migration ajoute des clés, index et un trigger, puis reprend les révisions.
2. Lancer `npm ci` puis `npm run migrate` avec `DATABASE_URL` et `JWT_SECRET` configurés.
3. Lancer `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:all` et `npm run build -w client`.
4. Redémarrer le serveur et déployer le client construit.
5. Ouvrir le dashboard, activer le parcours, choisir un objectif, enregistrer un rappel, vérifier l’activité et masquer le parcours. Recharger la page et vérifier que le masquage reste enregistré.

Les tests serveur utilisent `TEST_DATABASE_URL` vers une base dédiée dont le nom contient `test`. Ils réinitialisent cette base ; ne jamais utiliser la base de travail. La migration n’a pas de script descendant automatique, conformément au fonctionnement actuel du dépôt.

## Validation de cette livraison

Les résultats précis et les limites de l’environnement d’exécution figurent dans `VALIDATION.md` de l’archive de patchs. La suite couvre les séries et changements de dates, l’affichage facultatif, les erreurs de sauvegarde, l’isolation entre comptes, la reprise des anciennes révisions, l’atomicité du trigger, l’idempotence, les exports et les suppressions en cascade.

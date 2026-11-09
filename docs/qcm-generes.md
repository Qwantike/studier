# QCM générés à partir d’un chapitre

## Périmètre

Le MVP crée **cinq questions à choix unique**, quatre propositions par question, à partir du texte enregistré d’un chapitre. Trois difficultés : facile (rappel), intermédiaire (compréhension/application), difficile (raisonnement combinant des notions). Un exemple de style d’évaluation, facultatif et limité à 2 000 caractères, est transmis dans l’instruction de génération comme donnée non fiable.

Depuis un chapitre, « QCM d’entraînement » sauvegarde d’abord les modifications de l’éditeur avant d’ouvrir le formulaire. L’utilisateur choisit la difficulté, confirme l’envoi du texte à OpenAI, puis lance une génération. Il peut retrouver les vingt dernières demandes de ce chapitre, répondre, obtenir son score sur 5 et son corrigé, et refaire le même QCM sans nouvel appel à l’IA. Les vingt dernières tentatives sont consultables.

Les QCM sont distincts des évaluations officielles et n’entrent pas dans les moyennes. Ils ne créent pas de rappel ou de jour d’étude : un entraînement QCM n’est pas assimilé silencieusement à une révision du modèle de mémoire existant.

Pas de questions ouvertes, notation par IA, fichiers d’examens joints, QCM multi-chapitres ou génération d’images dans ce MVP. Les cours et explications ne sont pas vérifiés automatiquement sur le fond. Le score est déterministe **par rapport au corrigé enregistré**, qui peut être erroné : c’est un entraînement, pas une note officielle.

## Configuration du serveur

Dans le `.env` à la racine :

```dotenv
OPENAI_API_KEY=
QUIZ_MODEL=gpt-4o-mini
QUIZ_DAILY_LIMIT=5
QUIZ_PER_MINUTE=1
```

Une clé vide désactive uniquement les nouvelles générations. Les QCM et tentatives déjà enregistrés restent accessibles. La clé n’est jamais envoyée au navigateur ; ne pas utiliser une variable `VITE_*` pour elle. Aucun SDK supplémentaire n’est nécessaire : le serveur utilise `fetch` et l’API Responses d’OpenAI. Choisir un modèle compatible Responses et Structured Outputs, disponible sur le compte fournisseur. Le modèle est conservé avec chaque QCM, avec la version du prompt et celle de la notice acceptée.

La facturation dépend du modèle et des tokens. Le quota limite le nombre de demandes, pas une somme en euros. Les limites de facturation et le budget global du projet fournisseur doivent être configurés séparément par l’exploitant. Aucun montant fixe n’est affiché comme s’il s’agissait d’un prix garanti.

## Données transmises et information de l’utilisateur

Le serveur transmet le texte du chapitre (entre 80 et 20 000 caractères après suppression des références d’images Markdown/HTML) et l’exemple facultatif. Il n’effectue pas de troncature silencieuse et ne télécharge pas les liens du cours. Les fichiers d’images ne sont pas envoyés comme entrées visuelles. D’autres références textuelles, liens ou informations personnelles écrites dans le cours peuvent être incluses.

Le nom de compte, l’e-mail et les tentatives précédentes ne sont pas ajoutés à l’appel. Le formulaire demande un accord explicite pour chaque nouvelle demande et donne accès à `/confidentialite`. La même notice est accessible depuis le profil. L’API exige `consent: true` et enregistre sa version avec le QCM.

L’appel utilise `store: false`. Ce paramètre ne signifie pas une absence de journalisation ou de conservation chez le fournisseur. Ses règles et les paramètres contractuels du compte utilisé continuent de s’appliquer. La notice intégrée décrit le fonctionnement de cette fonctionnalité ; l’exploitant doit la compléter selon les coordonnées, contrats, hébergement et règles de conservation de son déploiement.

## Limites et réservation atomique

- Par défaut : 5 demandes par compte et par jour UTC, 1 demande par fenêtre glissante de 60 secondes, une génération active par compte.
- Les limites peuvent être réglées dans les bornes validées par la configuration : 1 à 100 demandes/jour, 1 à 10/minute. Elles restent contrôlées en base, sur toutes les instances de l’API, via un verrou de ligne utilisateur pris seulement pendant la réservation.
- La réservation est enregistrée **avant** l’appel externe, puis la transaction est libérée : aucun verrou de compte n’est gardé pendant l’attente du modèle.
- Les demandes ayant atteint la réservation consomment le quota même en cas d’échec, de refus, de dépassement du délai ou de redémarrage serveur. En cas de panne réseau, on ne peut pas déduire que le fournisseur n’a pas facturé.
- Les rejets avant réservation (chapitre absent, texte trop court ou trop long, consentement absent, clé vide, quota dépassé) ne consomment rien.
- Le registre `quiz_generation_requests` survit aux suppressions de chapitres : supprimer un QCM ne permet pas de contourner les quotas. Il est supprimé avec le compte.
- Même identifiant + mêmes paramètres : retour de la demande existante sans appel supplémentaire, y compris si elle a échoué. Même identifiant avec d’autres paramètres : HTTP 409. Une nouvelle génération doit avoir un nouvel identifiant et une nouvelle confirmation.
- Une demande restée « en cours » plus de deux minutes est considérée expirée dans l’interface. Une nouvelle réservation met les anciens états à jour. Elle n’est jamais relancée automatiquement.

L’appel externe est borné à 45 secondes, 6 000 tokens de sortie et 128 Kio de réponse HTTP lue. Aucun retry fournisseur automatique. Le délai HTTP du reverse proxy doit être supérieur à 45 secondes plus la marge pour les requêtes en base. Une annulation côté serveur n’est pas une garantie d’arrêt de facturation côté fournisseur.

## Sortie non fiable et correction

Le modèle reçoit un JSON Schema strict sans outil ni accès à d’autres comptes. Le cours et l’exemple sont explicitement présentés comme données non fiables, pas comme instructions. La sortie est ensuite validée par zod : exactement cinq questions distinctes, quatre choix distincts, tailles bornées, index de réponse de 0 à 3, explication non vide, propriétés supplémentaires refusées.

Les refus, réponses incomplètes, JSON invalide, réponses trop volumineuses et erreurs HTTP produisent une erreur générique, sans exposer la clé, le corps de réponse fournisseur ou le cours dans une erreur utilisateur. La validation structurelle ne prouve pas l’exactitude pédagogique des questions.

Les textes sont rendus par React comme du texte. Aucun HTML brut, Markdown exécutable ou lien cliquable produit par le modèle n’est injecté.

Les routes usuelles de consultation du QCM n’exposent ni `correct_index` ni les explications avant une soumission. Le serveur exige exactement une réponse pour chacune des cinq questions, vérifie les identifiants, calcule le score et conserve les choix. Une tentative possède aussi un identifiant idempotent : renvoyer les mêmes réponses n’ajoute pas une tentative. Les exports complets du propriétaire incluent volontairement les corrigés, même avant une tentative : il ne s’agit pas d’un système d’examen surveillé.

## Schéma et exports

Migration `010_quizzes.sql` :

| Table                      | Rôle                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `quiz_generation_requests` | Identifiant, utilisateur, statut et date de réservation ; registre des quotas sans texte du cours                 |
| `quizzes`                  | Chapitre, titre au moment de la génération, difficulté, empreintes du texte et des paramètres, modèle et versions |
| `questions`                | Énoncés, choix, index de bonne réponse et explications immuables                                                  |
| `attempts`                 | Choix soumis, score calculé, total et date                                                                        |

Toutes portent `user_id`. Les liens chapitre/QCM/questions/tentatives sont protégés par clés étrangères composées avec l’utilisateur. Les nouvelles routes utilisent systématiquement la session ; un identifiant ne permet pas de lire ou modifier les données d’un autre compte.

La suppression d’un chapitre supprime ses QCM, questions et tentatives, mais conserve le registre minimal de consommation. La suppression du compte supprime tout. Le texte source et l’exemple ne sont pas dupliqués en base ; des empreintes SHA-256 sont conservées. Les questions restent liées à la version du chapitre au moment de leur génération ; éditer le cours ne les réécrit pas.

Les exports complets JSON et SQLite passent en version **6** et incluent les quatre tables. Les tableaux de choix et objets de réponses sont des JSON textuels dans SQLite. Les exports de sélections conservent leur portée existante et n’ajoutent pas de données globales du compte.

## API

| Méthode | Route                       | Rôle                                                       |
| ------- | --------------------------- | ---------------------------------------------------------- |
| GET     | `/api/quizzes/config`       | Disponibilité et quota journalier restant du compte        |
| GET     | `/api/chapters/:id/quizzes` | Vingt dernières demandes du chapitre                       |
| POST    | `/api/chapters/:id/quizzes` | Réserver et générer, ou rejouer la demande existante       |
| GET     | `/api/quizzes/:id`          | État, questions sans corrigé et vingt dernières tentatives |
| POST    | `/api/quizzes/:id/attempts` | Corriger et enregistrer cinq réponses                      |
| GET     | `/api/quiz-attempts/:id`    | Retrouver le score et le corrigé d’une tentative           |

Toutes exigent une session. Les mutations héritent de la protection d’origine/CSRF du projet. Réponses `Cache-Control: no-store`. Les soumissions sont en outre limitées à 60/minute/compte par processus ; les limites de **génération payante** sont persistantes en base.

Corps de génération :

```json
{
  "id": "UUID de demande",
  "difficulty": "medium",
  "example": "facultatif",
  "consent": true
}
```

Corps de tentative :

```json
{ "id": "UUID de tentative", "answers": { "UUID de question": 0 } }
```

Les index commencent à zéro ; `answers` doit contenir les cinq questions exactes du QCM. Ne pas envoyer de score ou de corrigé côté client.

## Déploiement et validation

Sauvegarder la base, arrêter l’API, appliquer les patchs puis `npm run migrate`. Renseigner la clé serveur si la génération doit être disponible. Redémarrer ensuite l’API et déployer le client construit. Aucun changement du lockfile ni nouvelle dépendance.

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test:all
npm run build -w client
```

Les nouveaux tests simulent le fournisseur : aucun appel payant ni envoi de cours réel. Voir le rapport de validation livré avec les patchs pour les résultats et les restrictions du serveur PostgreSQL embarqué utilisé localement. La CI existante possède déjà PostgreSQL 17 et exécute les tests sur Node 22 et 24.

## Documentation officielle consultée

Consultation le 9 novembre 2026 :

- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) : format `text.format` et JSON Schema strict, validation complémentaire et traitement des refus.
- [Data controls](https://developers.openai.com/api/docs/guides/your-data) : ne pas assimiler `store: false` à une absence de conservation.

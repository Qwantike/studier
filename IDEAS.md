# Études : idées d'évolutions

Document de réflexion, rien n'est engagé. Les estimations sont indicatives.

**Comment lire les chiffres**
- **Difficulté** : ★ très simple · ★★ simple · ★★★ moyen · ★★★★ difficile · ★★★★★ très difficile.
- **Temps** : jours de travail effectif (une journée = environ 6 h concentrées), pour une personne aidée par Claude, tests et typecheck compris, déploiement et retours d'utilisateurs exclus. Ce sont des ordres de grandeur, à recalibrer après le premier chantier.
- Les points marqués « à vérifier » reposent sur des API ou des comportements que je n'ai pas testés dans ton projet.

---

## 1. Tes idées

| #   | Idée                                                      | Difficulté | Temps estimé                                            |
| --- | --------------------------------------------------------- | ---------- | ------------------------------------------------------- |
| 1   | Tableau blanc (Excalidraw)                                | ★★★        | 2 à 4 j                                                 |
| 2   | Courbe de l'oubli (Ebbinghaus) et répétition espacée      | ★★★★       | 4 à 7 j                                                 |
| 3   | Tout télécharger d'un coup (ZIP avec dossiers)            | ★★         | 1 à 2 j (+ 1 à 2 j pour le réimport)                    |
| 4   | Dashboard gamifié                                         | ★★★        | 3 à 5 j                                                 |
| 5   | Export PDF                                                | ★ à ★★★    | 0,5 à 1 j (impression) ou 2 à 4 j (serveur)             |
| 6   | Évaluations générées (interactives, avec corrigé et note) | ★★★★★      | 5 à 8 j (QCM seul) ou 3 à 4 semaines (version complète) |
| 7   | Couleur du texte et surlignage                            | ★★★        | 2 à 3 j                                                 |

### 1. Tableau blanc (Excalidraw)
- Composant React à charger paresseux, comme l'éditeur de chapitre (il est lourd). Compatibilité avec ta version de React : à vérifier.
- La scène se sauvegarde en JSON dans une nouvelle table (avec `user_id` et clés composites, comme le reste), rattachée à une matière ou un chapitre.
- Attention à la taille : les images incorporées gonflent vite la scène, il faut un plafond par scène et par compte.
- Export PNG/SVG en bonus.

### 2. Courbe de l'oubli et répétition espacée
- Modèle simple : rétention estimée `R = e^(−t/S)`, où la stabilité `S` augmente à chaque révision réussie. Pour aller plus loin, des algorithmes comme SM-2 ou FSRS existent.
- Nouvelle table `reviews` (chapitre, date, auto-évaluation), calcul de la rétention estimée affichée par chapitre, vue « à réviser aujourd'hui ».
- Se relie naturellement aux statuts de chapitre existants (`seen`, `understood`, `revised`) et aux dates d'évaluation.
- À présenter comme une estimation : les paramètres ne sont pas calibrés sur chaque personne.

### 3. Téléchargement complet (ZIP)
- Arborescence `Année/Semestre/Matière/NN-Chapitre.md`, avec nettoyage des noms (caractères interdits, doublons, longueur).
- Génération côté serveur en flux, ou côté client avec une bibliothèque de ZIP. Prévoir un plafond de taille et une limite de débit.
- Sert aussi d'« export de mes données », utile pour le RGPD.
- Le réimport (ZIP vers hiérarchie recréée) double presque le travail ; l'import multi-fichiers actuel couvre déjà le cas d'une matière.

### 4. Dashboard gamifié
- Séries de jours d'étude, objectifs hebdomadaires, badges, progression par matière.
- Demande une table d'événements d'activité (ce qui est révisé, quand).
- Plus pertinent après l'idée 2. Garder une option pour le masquer : des mécaniques culpabilisantes peuvent nuire plus qu'aider.

### 5. Export PDF
- **Rapide** : une feuille de style d'impression et `window.print()` (KaTeX et code doivent s'afficher correctement). C'est le point de départ que je conseille.
- **Propre côté serveur** : un navigateur sans interface (Chromium) qui imprime la page. Le coût mémoire est élevé sur un VPS partagé : à mesurer avant, et à limiter en débit.
- Une bibliothèque de PDF côté client est possible, mais la qualité du rendu (maths, code) est incertaine.

### 6. Évaluations générées
- Fonction très demandée par les étudiants, mais la plus lourde : appel à un modèle d'IA depuis le serveur (clé dans le `.env`), avec un coût par génération.
- À prévoir : quotas et limites de débit par compte, sortie structurée en JSON validée par zod, tables `quizzes`, `questions`, `attempts` (avec `user_id`).
- Niveaux de difficulté et exemple d'évaluation : à passer dans l'instruction envoyée au modèle.
- La note et le corrigé : sûrs pour des QCM, indicatifs pour des questions ouvertes (la correction par un modèle n'est pas déterministe).
- Le contenu des cours est envoyé à un tiers : à mentionner dans la politique de confidentialité. Traiter la sortie comme non fiable (jamais de HTML brut).
- **MVP** : QCM à partir d'un chapitre, difficulté au choix, corrigé, score. Le reste vient après.

### 7. Couleur du texte et surlignage
- Surlignage : syntaxe `==texte==` (lisible dans Obsidian et Typora), environ 1 j.
- Couleur : palette fixe de quelques teintes adaptées au mode sombre, plus fragile car il n'existe pas de syntaxe Markdown standard, environ 2 j.
- Prérequis : relire `MarkdownEditor.tsx` et `editor.css`.

---

## 2. Idées supplémentaires

| #   | Idée                                                                              | Difficulté | Temps estimé                                          | Pourquoi                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Corbeille et historique des versions de chapitre                                  | ★★         | 2 à 4 j                                               | Supprimer une année supprime tout en cascade, et la sauvegarde automatique écrase le texte : un seul faux clic peut coûter un semestre de cours                      |
| B   | Planificateur de révisions avant une évaluation                                   | ★★★        | 3 à 5 j                                               | Combine dates d'évaluations, chapitres et rétention (idée 2) : c'est ce qui te différencie le plus d'un simple éditeur de notes                                      |
| C   | Simulateur de moyenne (« quelle note pour valider ? »)                            | ★          | 1 à 2 j                                               | Très utile, peu coûteux, réutilise la logique des moyennes                                                                                                           |
| D   | Recherche plein texte dans les cours                                              | ★★         | 1 à 2 j                                               | PostgreSQL sait le faire ; s'ajoute à la palette de commandes existante                                                                                              |
| E   | Flashcards à partir des chapitres                                                 | ★★★★       | 5 à 8 j (+ 3 à 5 j avec génération par IA)            | Cas d'usage classique, se combine avec la répétition espacée                                                                                                         |
| F   | Images dans les chapitres                                                         | ★★★★       | 4 à 7 j                                               | Téléversement, vérification du type et de la taille, quota par compte, stockage hors base, nettoyage des fichiers orphelins. Le bloc image est désactivé aujourd'hui |
| G   | Rappels par e-mail (révisions du jour, évaluation proche)                         | ★★★        | 2 à 4 j                                               | Partage le service d'envoi avec le mot de passe oublié                                                                                                               |
| H   | Application installable (PWA)                                                     | ★★★        | 2 à 4 j                                               | Les étudiants consultent surtout sur mobile ; l'écriture hors ligne est un chantier à part (conflits)                                                                |
| I   | Lien de partage en lecture seule + « importer dans mon compte »                   | ★★★★       | 4 à 6 j                                               | Boucle de croissance entre étudiants. Routes publiques : jetons non devinables, révocation, aucune fuite de données privées, tests dédiés                            |
| J   | Matières partagées entre comptes (collaboration)                                  | ★★★★★      | 3 à 6 semaines                                        | Change tout le modèle d'isolation (rôles, permissions, clés composites, tests) : à n'envisager qu'après avoir validé l'usage                                         |
| K   | Minuteur d'étude et suivi du temps par matière                                    | ★★         | 2 à 3 j                                               | Alimente le dashboard et la gamification                                                                                                                             |
| L   | ECTS et validation de semestre                                                    | ★★★        | 3 à 5 j                                               | Les règles varient selon les universités ; à rendre configurables                                                                                                    |
| M   | Vue jour du calendrier sur mobile, glisser-déposer dans l'arbre, page par matière | ★ à ★★     | 1 j, 1 à 2 j, 2 à 3 j                                 | Déjà dans ta liste en attente                                                                                                                                        |
| N   | Interface en anglais                                                              | ★★★        | 3 à 5 j                                               | Ouvre à d'autres publics ; à faire si tu vises au-delà de la France                                                                                                  |
| O   | Mode lecture et verrou de chapitre                                                | ★★         | 0,5 j (mode lecture) ou 1,5 à 2 j (verrou persistant) | Évite les modifications accidentelles et rend la lecture plus propre ; Crepe sait passer l'éditeur en lecture seule                                                  |


### O. Mode lecture et verrou de chapitre
- **Niveau 1, mode lecture (interface seulement)** : un cadenas dans l'en-tête du chapitre passe l'éditeur en lecture seule (Crepe expose `setReadonly`, vérifié dans sa documentation). Pas de migration, environ 0,5 j. Ne protège pas contre un autre onglet resté ouvert.
- **Niveau 2, verrou persistant (comme Notion)** : colonne `locked` sur `chapters` (migration), refus côté serveur de toute modification du titre ou du contenu d'un chapitre verrouillé (sinon l'autosave d'un autre onglet pourrait l'écraser), environ 1,5 à 2 j avec les tests. C'est la version conseillée : elle tient quand on oublie qu'on a verrouillé.
- À décider : le verrou ne bloque ni le statut ni le déplacement dans l'arbre ; la suppression d'un chapitre verrouillé exige ou non un déverrouillage préalable.
- En lecture seule : liens cliquables directement, barre d'outils, menu `/` et poignées de blocs masqués (par CSS, à ajuster d'après le rendu réel), cases à cocher non modifiables comme dans Notion.
- Tests à ajouter : modification refusée sur un chapitre verrouillé, déverrouillage possible, un autre compte ne peut ni verrouiller ni déverrouiller.
- Fichiers nécessaires : `ChapterEditor.tsx`, `MarkdownEditor.tsx`, `useChapterSaver.ts`, `api/types.ts`, `editor.css`.

---

## 3. Prérequis avant d'ouvrir au public

Ce ne sont pas des fonctionnalités, mais elles passent avant tout le reste :
- Mot de passe oublié et vérification d'e-mail (2 à 4 j, avec un service d'envoi).
- Sauvegardes quotidiennes avec copie hors du serveur, et restauration testée.
- Quotas par compte (nombre de chapitres, volume de texte).
- Mentions légales, politique de confidentialité, conditions d'utilisation.
- Intégration continue (`npm test` à chaque modification) et suivi d'erreurs.

---

## 4. Ordre que je suggérerais

1. **Confiance** : corbeille et versions (A), sauvegardes, prérequis ci-dessus.
2. **Gains rapides** : PDF par impression (5), ZIP (3), simulateur de moyenne (C), recherche (D), verrou de chapitre (O).
3. **Confort d'écriture** : surlignage puis couleur (7).
4. **Ce qui te différencie** : courbe de l'oubli (2), puis planificateur de révisions (B).
5. **Rétention** : gamification (4), rappels (G).
6. **Gros chantiers, à décider après avoir mesuré l'usage** : évaluations générées (6), Excalidraw (1), partage par lien (I), flashcards (E).

Les chantiers 1 à 3 peuvent se faire sans nouveau service payant. Les évaluations générées et les flashcards par IA ajoutent un coût variable par utilisateur : à chiffrer avant de les proposer gratuitement.
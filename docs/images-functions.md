# Images et courbes dans les notes

## Installer

Depuis la racine du dépôt, avec Node 22.12+ ou 24 :

```text
npm ci
npm run migrate
npm run lint
npm run typecheck
npm test -w client
npm test -w server
npm run dev
```

La migration `007_note_images.sql` ajoute les fichiers privés du compte. Les anciennes
migrations sont inchangées. `sharp` 0.35.5 est la seule nouvelle dépendance : npm
installe normalement son binaire adapté à Windows x64/ARM64. Aucun LaTeX ni service
externe n'est nécessaire. Le serveur doit pouvoir lire les dépendances natives sharp.
En production derrière nginx, autoriser un corps de requête d'au moins 5 Mio.

## Images

Dans une note : **+ → Advanced → Image → Importer**. Coller une image depuis le
presse-papiers ou glisser un fichier dans l'éditeur utilise le même téléversement.
Les URL Markdown distantes restent possibles mais ne sont pas copiées dans le compte.

Formats importés : PNG, JPEG, WebP et GIF. Le serveur vérifie le contenu réel,
limite l'entrée à **4 Mio et 20 millions de pixels**, corrige l'orientation, retire
les métadonnées et redimensionne à **2 560 × 2 560 px maximum**, sans agrandir.
JPEG reste JPEG ; les autres deviennent PNG. Les GIF/WebP animés deviennent une image
fixe. Le fichier traité doit aussi tenir dans 4 Mio. SVG et formats actifs sont refusés.

Le compte dispose de **50 Mio / 500 images**, indépendamment du quota Excalidraw.
Les fichiers sont stockés en base avec `user_id`, dimensions, type, taille calculée
et données base64. La limite SQL utilise un verrou du compte ; l'API limite aussi
les imports à 20/minute par utilisateur. Un accès à un fichier d'un autre compte
renvoie 404. Il n'existe pas d'URL publique : la session est nécessaire.

Les notes conservent une référence Markdown `![description](/api/note-images/UUID)`.
Le fichier peut être réutilisé dans plusieurs notes du même compte. Retirer l'image
d'une note, supprimer un chapitre ou interrompre un import ne supprime pas
automatiquement le fichier : le nettoyage se fait dans **Profil → Images des notes**.
La suppression est refusée si une note enregistrée référence encore l'image.
Enregistrer d'abord les notes modifiées. Supprimer le compte efface ses fichiers.
Les URL ne contiennent pas le nom original et les réponses ne sont pas mises en cache.

## Fonctions

**+ → Advanced → Fonctions**, ou `/fonctions`, insère un bloc `plot` avec un exemple.
Modifier le code pour changer le graphique. Il reste du Markdown éditable ; le bouton
de prévisualisation CodeMirror permet de masquer le code.

````markdown
```plot
sin(x)
x^2 / 4
x: -5, 5
y: -2, 7
title: Comparaison de deux fonctions
```
````

- Une à cinq expressions par bloc ; facultativement `y = ...` ou `f(x) = ...`.
- Variable `x`, constantes `pi`, `e`, opérateurs `+ - * / ^` (ou `**`), parenthèses.
- Multiplication explicite : `2*x`, pas `2x`. Décimales avec un point.
- Fonctions : `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sqrt`, `abs`, `exp`,
  `ln`, `log` (naturel), `log10`, `floor`, `ceil`. Angles en radians.
- Axes optionnels `x: minimum, maximum`, `y: minimum, maximum` ; défaut `-5, 5`.
  Bornes finies, valeur absolue ≤ 1 000 000 et intervalle ≥ 0,000001.
- Titre optionnel `title: ...` (150 caractères). Lignes vides et commentaires `#` ignorés.
- Maximum 4 000 caractères par bloc, 200 caractères / 128 symboles par expression,
  profondeur syntaxique 32. Les erreurs s'affichent dans le bloc sans perdre sa source.

Un interpréteur limité aux fonctions ci-dessus calcule les valeurs. Aucun `eval`,
aucun code JavaScript utilisateur, aucun accès aux propriétés ou au réseau.
Le SVG échappe le titre et les expressions, puis passe par DOMPurify dans l'éditeur.
La génération client et serveur partage le même calcul.

Il s'agit de courbes cartésiennes **y = f(x)** approximées par 801 échantillons.
Les valeurs hors cadre/non finies interrompent la courbe et les grands sauts ne
sont pas reliés. Les oscillations très rapides et les discontinuités peuvent être
mal représentées ; réduire l'intervalle et vérifier le domaine. Ce n'est pas un
calculateur formel, ni un moteur TikZ/PGFPlots, ni du tracé implicite/3D.

## Exports

- **PDF** : images importées incorporées et courbes `plot` tracées en vecteurs,
  avec axes et légende. Les images distantes ne sont jamais téléchargées ; elles
  restent des descriptions. Mermaid et les formules LaTeX conservent leur source.
- **ZIP Markdown** : images sous `images/`, liens relatifs dans les fichiers MD ;
  source `plot` conservée et aperçus SVG autonomes sous `graphiques/`, référencés
  à la fin du MD. Un lecteur Markdown sans extension `plot` peut ainsi voir les courbes.
- **Markdown seul** : conserve les URL privées des images et la source `plot`.
  Choisir ZIP pour disposer des fichiers hors ligne.
- **ZIP complet / `.db`** : toutes les images du compte, même inutilisées, sont
  dans `data.json` / `note_images` (base64), et dans `images/` pour le ZIP.
  L'instantané et le SQLite utilisent désormais la **version 4** (avec les révisions), avec les tableaux blancs
  existants. Un export de sélection ne prend que les images référencées par ses chapitres.
- Plafonds d'export relevés à 128 Mio de JSON de données et 256 Mio avant compression
  ZIP pour contenir le quota d'images et les représentations multiples. Les autres
  limites (200 chapitres PDF, 16 Mio/PDF, deux exports par processus) sont conservées.
  Les archives restent produites en mémoire ; les très gros comptes peuvent atteindre
  ces limites. `.db` est un instantané portable, pas une restauration automatique.

## Vérification de cette série

- 44 tests client, dont priorité des opérations, expressions interdites, configuration,
  interruption des branches de `1/x`, domaine de `sqrt` et échappement SVG.
- 83 tests serveur ciblés : auth, exports, tableaux blancs et 9 tests images.
  Migrations 001–007 appliquées via PostgreSQL embarqué PGlite ; aucun serveur
  PostgreSQL réseau disponible dans cet environnement. Les tests livrés restent
  branchés sur `TEST_DATABASE_URL` comme ceux du dépôt.
- Parcours navigateur : insertion par le menu +, import d'une image, sauvegarde,
  rechargement, aperçu des courbes, gestion des images et téléchargement PDF.
- TypeScript, ESLint et compilation de production. L'avertissement de gros bundle
  Excalidraw/Milkdown/Mermaid reste présent.

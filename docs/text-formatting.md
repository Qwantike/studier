# Couleur du texte et surlignage

## Installer cette série

Sur la version `studier-dev-mermaid-excalidraw(3).zip`, appliquer les quatre
commits, puis depuis la racine :

```text
npm ci
npm run lint
npm run typecheck
npm test -w client
npm test -w server
npm run build -w client
npm run dev
```

Aucune migration, variable d'environnement ou mise à niveau de React/Milkdown.
Les dépendances de syntaxe utilisées par Milkdown sont maintenant déclarées
explicitement et verrouillées ; aucun éditeur supplémentaire n'est ajouté.
Les tests serveur conservent le dispositif PostgreSQL isolé `TEST_DATABASE_URL`
du dépôt : ne jamais le diriger vers une base contenant des données utiles.

## Utilisation

Sélectionner du texte dans la note pour afficher sa barre de mise en forme :

- **Surligner** active ou retire le fond jaune. Raccourci **Ctrl+Maj+H** sous
  Windows/Linux, **Cmd+Maj+H** sous macOS. La saisie `==texte==` active aussi
  le surlignage dès la dernière frappe.
- Les six pastilles appliquent **Rouge, Orange, Vert, Bleu, Violet ou Rose**.
  Choisir une autre pastille remplace la couleur ; les couleurs ne s'empilent pas.
- **Texte : couleur par défaut** retire uniquement la couleur. Le gras et le
  surlignage sont conservés. Pour retirer le surlignage, utiliser son bouton.
- Les commandes participent à l'historique annuler/rétablir. Entrée ou Espace
  active les nouveaux boutons lorsqu'ils ont le focus clavier.
- Sur petit écran, la barre se répartit sur plusieurs lignes. Le nom de chaque
  couleur figure dans son infobulle et son libellé accessible.

Les couleurs ont une variante pour les fonds clairs et une pour les fonds sombres.
Dans un surlignage jaune, la variante foncée est utilisée pour garder le contraste,
y compris en mode sombre. Les six teintes dépassent 4,5:1 sur les fonds de référence
blanc, zinc 900 et jaune de surlignage ; ce contraste est vérifié par un test.
La sélection native du texte utilise un contraste blanc/indigo temporaire.

## Format Markdown et portabilité

Le surlignage utilise la syntaxe attendue par Obsidian et Typora :

```markdown
==À retenir **pour l'examen**==
```

On peut le combiner au gras, à l'italique, aux liens et aux couleurs, dans les
paragraphes, titres, listes et tableaux. Les marqueurs dans le code restent du
code ; `\==littéral==` reste du texte. Les marqueurs incomplets, espaces contre
les délimiteurs (`== texte ==`) et suites de trois signes `===` ne sont pas reconnus.
Les signes `=` littéraux susceptibles de devenir des marqueurs sont échappés lors
de la sauvegarde ; une égalité simple `x=2` reste inchangée.

Le Markdown ne définit pas de couleur standard. Studier écrit une forme HTML
limitée à sa palette, par exemple :

```html
<span data-note-color="blue" style="color: #1d4ed8">Une notion en bleu</span>
```

Le style donne une couleur aux lecteurs qui rendent le HTML inline ; l'attribut
identifie la teinte pour Studier et lui permet de l'adapter au thème. Ce format
est volontairement plus fragile que le surlignage : certains lecteurs ignorent
ou suppriment le HTML/styles, et les couleurs externes ne s'adaptent pas
nécessairement à leur thème. Il ne s'agit pas d'une compatibilité universelle.

Le lecteur reconnaît les spans fermés produits par Studier, dans un même bloc
inline. Il n'interprète pas les styles CSS arbitraires, les attributs actifs ou
les noms de couleurs inconnus comme une couleur de note. Le collage HTML d'un
span portant un identifiant de palette valide conserve seulement cette couleur ;
les attributs supplémentaires ne sont pas reproduits par le schéma de l'éditeur.
Les spans sur plusieurs paragraphes sont enregistrés séparément par paragraphe.
Les anciennes notes restent lisibles ; aucune conversion en masse n'est nécessaire.

## Exports

- **Markdown** et **ZIP MD** : marqueurs `==...==` et spans de couleur conservés,
  donc toujours éditables. Les images, courbes et tableaux blancs sont inchangés.
- **PDF** et **ZIP PDF** : couleurs et surlignages dessinés dans le document,
  y compris dans les titres, listes et tableaux. Les fonds suivent les retours
  à la ligne et les changements de page. Le gras est également conservé.
  L'italique et le barré restent aplatis dans ce générateur PDF ; les autres
  limites existantes (LaTeX/Mermaid en source, mise en page des tables) restent
  décrites dans le guide des exports.
- **Export complet JSON / `.db`** : la source Markdown de chaque chapitre est
  préservée. Les exports complets utilisent désormais la version 4, avec l’historique
  des révisions (voir le guide des révisions espacées).

## Vérification

- 64 tests client : syntaxe, marqueurs échappés, code, formats imbriqués,
  aller-retour de la palette, HTML refusé et contrastes, plus la suite existante.
- 95 tests serveur ciblés : mise en forme PDF, auth, images, exports et tableaux
  blancs. Exécutés ici avec PostgreSQL embarqué PGlite ; le protocole réseau
  PostgreSQL et Windows restent à vérifier avec le dispositif habituel du dépôt.
- Navigateur Chromium/Vite 8 : sélection, remplacement/reset des couleurs,
  raccourci, Entrée clavier, historique, saisie `==...==`, sauvegarde/rechargement,
  collage HTML nettoyé, thèmes clair/sombre et viewport mobile de 390 px.
- PDF généré puis rendu et inspecté ; texte extrait et instructions de couleur
  et de surlignage vérifiées. TypeScript, ESLint et compilation de production.

La résolution des marqueurs s'appuie sur l'algorithme de délimiteurs de
`micromark-extension-gfm-strikethrough`, adapté aux signes `=`. Attribution et
licence MIT conservées dans `docs/licenses/highlight-syntax.txt`.

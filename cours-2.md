# Cours 1

# Pourquoi le logiciel résiste-t-il à la planification ?

Développer un logiciel c'est :

* Comprendre
* Concevoir
* Fabriquer
* Valider
* Exploiter
* Faire évoluer

Le développement commence avant la première ligne de code et continue après la première mise en production.

## Une activité d'ingénierie singulière

**Invisible** : La progression réelle et les défauts sont difficiles à observer.

**Copiable** : Produire le deuxième exemplaire coûte presque zéro, concevoir le premier reste difficile.

**Malléable** : Le logiciel se modifie mais ses dépendances et ses usages créent un coût.

La complexité est plus dans les relations que dans la matière.

# Historique

Aux origines, c'est un monde plus contenu

**Contraintes dominantes** : mémoire et calcul rares, accès limité aux machines, programmation très technique.

**Organisation** : périmètres applicatifs restreints, équipes et communautés réduites, utilisateurs souvent proche des concepteurs.

Avec la **démocratisation**, la complexité change d'échelle :

* multiplication des domaines d'application
* logiciels plus vastes et interconnectés
* davantage d'utilisateurs et de parties prenantes
* enjeux économiques croissants
* pression sur les délais et la productivité

**Dans les années 1960** il y a la crise du logiciel :

* dépassements de délais et projets abandonnés
* budgets difficiles à prévoir
* exigences mal comprises ou non satisfaites
* fiabilité et maintenance insuffisantes

Les attentes progressent plus vite que les pratiques capables de les satisfaire

Même si les capacités ont radicalement progressé, les symptômes persistent. \
Nous savons mieux construire (langages, bibliothèques, cloud, tests, automatisation, observabilité) mais la cible bouge (usages, concurrence, réglementation, équipe, technologie et compréhension du besoin)

# Le cycle de vie

Analyse <-> conception <-> fabrication <-> validation <-> exploitation <-> maintenance & évolution <-> retraite

les méthodes organisent essentiellement les mêmes activités mais diffèrent par leur séquencement et leurs boucles de feedback.

## Analyser le besoin

comprendre :

* les personnes concernées
* leurs objectifs et contraites
* le contexte réel d'utilisation

arbitrer :

* désirable <-> faisable
* valeur <-> coût
* qualité <-> délai
* besoins parfois contradictoires

Une excellente exécution du mauvais besoin reste un échec

**validation** : construisons-nous le bon produit ?

**vérification** : construisons-nous correctement le produit ?

Exemple : "l'étudiant doit pouvoir réserver rapidement une salle de travail disponible"\
Cette phrase semble définir un acteur, une action, un résultat attendu, mais elle ne définit pas un délai acceptable, des règles, des conflits, des droits, l'accessibilité, l'actualisation des données ...

**Documenter permet de réduire les ambiguïtés** mais ça ne remplace ni la conversation, ni l'observation, ni le feedback

# La quête de prédictibilité

**Processus dirigés par la planification**

**Principe** : les activités, livrables, responsabilités et jalons sont largement définis **à l'avance**

**Mesure** : la progression est comparée au plan de référence : périmètre, budget, calendrier.

Nous étudions Cascade, V, Spirale. Elles ne sont ni identiques, ni toujours appliquées à la lettre.

## Le modèle en cascade

Étude
préalable → Analyse → Conception → Implémentation → Validation → Mise en
service

**Réduire l'incertitude par l'étude et la conception → matérialiser puis vérifier la solution**

1. Faisabilité & besoins
2. Exigences & plan
3. Architecture et détail
4. Code & intégration
5. Test & recette
6. Déploiement & exploitation

La cascade rend possible :

* **Lisibilité** : phrases, responsabilités, jalons explicites
* **Contractualisation** : livrables, décisions formalisés
* **Prévision** : budget, calendrier détaillés à partir d'hypothèses connues

*Une prévision détaillée n'est pas nécessairement une prévision exacte*

**Limite** : décision tôt et validation tard. \
On peut accumuler :

* hypothèses eronnées
* intégrations non testées
* évolution du contexte
* travail conforme au plan mais inutile

*Plus le feedback arrive tard, plus une erreur a eu le temps de contaminer conception, code, tests, données et contrats.*

Exemple : une règle change à six semaine de la livraison. une seule règle remet en cause plusieurs décisions déjà conçues, implémentées et validées.

**La cascade n'interdit pas le changement mais on absorption peut devenir lente et coûteuse.**

## Le modèle en V

**Besoin                                                                                                                                      Recette**  \
résultats attendu                                                                                                                        Besoins

***

Architecture                                                                                        Test d'intégration

&#x20;          conception générale                                                                                    architecture

***

Conception détaillée                                                    Tests unitaires

&#x20;                       composants                                                                        composants

***

&#x20;                                                       Implémentation

<br />

Chaque niveau de définition prépare un niveau de test correspondant.

**Une validation a plusieurs granularité** :

* **Unitaire**  : Une unité isolée respecte son comportement attendu
* **Intégration**  : Les composants coopèrent correctement
* **Système** : Le système répond aux exigences
* **Recette** : Le client ou métier accepte le résultat dans son contexte

*Préparer un test tôt oblige à préciser ce que "correct" signifie*

<br />

* **Forces** : Traçabilité exigences <-> tests, rigueur et responsabilités explicites, adapté à certains environnements réglementés
* **Vigilances** : rigidité si les phases sont cloisonnées, intégration globale potentiellement tardive, coût élevé d'une mauvaise cible initiale

## La spirale (piloter par le risque)

1. **Objectifs** : alternatives et contraintes
2. **Risques** : évaluer et réduire
3. **Développer** : construire et vérifier
4. **Planifier** : Préparer le cycle suivant

<br />

* **Forces** : Risques rendus explicites, prototypes et alternatives, engagement progressif, adaptation entre cycles
* **Vigilances** : expertise de gestion du risque, gouvernance plus complexe, coût parfois disproportionné, fin et découpage à clarifier

**La spirale est déjà un pont entre planification et adaptation**

| **Contexte**                    | Ce qui compte                      | Posture plausible              |
| :------------------------------ | :--------------------------------- | :----------------------------- |
| exigences stables, audit fort   | traçabilité, conformité            | planification structurée       |
| technologie ou besoin incertain | apprentissage, réduction du risque | prototypes, spirale, itération |
| feedback utilisateur fréquent   | valeur et adaptation rapides       | approche agile                 |
| contraintes mixtes              | coordination et apprentissage      | approche hybride explicite     |

**Le contexte est roi, mais il faut pouvoir expliquer les compromis de son choix.**

# Les méthodes Agile

*Les méthodes agiles réduisent le délai de feedback*

* **Planifier progressivement** : décider en fonction des connaissances disponibles, puis réviser lorsque ces connaissances évoluent.
* **Livrer par incréments** : produire régulièrement quelque chose d'utilisable afin d'obtenir du feedback concret.

**Agile ne signifie pas sans plan, mais ne pas confondre le plan avec la réalité.**

<br />

**Février 2001** : Le manifest pour le développement Agile de logiciel\
4 valeurs, 12 principes : agilemanifesto.org/iso/fr/

**Des préférences plus que des interdictions**

| individus et interactions          | plus que     | Processus et outils           |
| :--------------------------------- | :----------- | :---------------------------- |
| **logiciels opérationnels**        | **plus que** | **documentation exhaustive**  |
| **collaboration avec les clients** | **plus que** | **négociation contractuelle** |
| **adaptation au changement**       | **plus que** | **suivi d'un plan**           |

<br />

**Boucle courte :**

Analyser → Concevoir → Fabriquer → Valider

<br />

**Agile ≠ Scrum ≠ pratiques d’ingénierie**

* **Agile**  : Valeurs et principes pour agir dans l'incertitude
* **Scrum/Kanban** : Cadres pour organiser décisions, collaboration et flux
* **Ingénierie** : Tests, automaticés, CI, revue de code, refactoring, observabilité ...

*Un bon processus ne compoense pas durablement de mauvaises pratiques techniques et inversement.*

## Scrum

*L'ingénierie des exigences*

Un cadre léger et structuré :

* **Fondements** : empirisme, pensée Lean, transparence, inspection, adaptation.
* **Finalité** : Aider une petite équie auto-gérée à produire de la valeur face à un problème complexe.

*Scrum est un cadre, pas une procédure complète ni une méthode de programmation.*

<br />

**Product Backlog**
Ordonné et émergent
\
**Sprint Planning**
Objectif + sélection
\
**Sprint Backlog**
Objectif + plan
\
**Sprint**
Construire · inspecter
adapter chaque jour
\
**Incrément**
Utilisable\
Puis review et feedback pour adapter le product backlog

**Product backlog** \
Une liste ordonnée et émergente de ce qui est nécessaire pour améliorer le produit.

* **Unique** : une source de travail pour l'équipe Scrum
* **Évolutif** : les éléments apparaissent, changent, disparaissent
* **Orienté objectif** : le Product Goal donne une direction long terme

**User story**\
C'est le support de conversation : en tant que ... je veux ... afin de ...\
Courantes dans les équipes agiles mais non imposée par scrum et insuffisante sans conversation. Elle exprime une intention du point de vue d'une personne et elle ne remplace pas automatiquement toute spécification utile.

* **Card** : une formulation courte, mémorable et visible
* **Conversation** : les détails se découvrent avec les parties prenantes
* **Confirmation** : Des exemples ou critères rendent le résultat vérifiable.

*La carte n'est pas le besoin complet, elle est le rappel partageable.*

Exemple : En tant qu'étudiant, je veux voir les salles disponibles pour un créneau donnée, afin de trouvé rapidement un espace de travail.

**Critères d'acceptation**\
Rendre le besoin observable

* **Clarifier** : un exemple concret chasse les interprétations
* **Valider** : le métier peut confirmer le comportement
* **Tester**  : le scénario peut guider un test fonctionnel

**Du besoin flou à un élément testable**\
Chaque étape réduit l'ambiguïté sans prétendre décrire définitivement tout le besoin

1. **Intention** : réserver rapidement une salle
2. **Conversation** : acteur, créneau, droits, disponibilité, valeur attendue
3. **Confirmation** : des exemples observables sous forme de critères d'acceptation

**Le sprint** \
Sert de cadence de décision

* **Durée fixe** : un moins ou moins, souvent 1 à 3 semaines selon le contexte
* **Objectif** : le **sprint goal** donne une intention cohérente
* **Prévision** : le périmètre peut être clarifié et renégocié sans mettre l'objectif en danger

*On s'engage sur la poursuite de l'objectif et la qualité, pas sur un périmètre arbitrairement figé.*

**Les trois responsabilités Scrum**\
*Une seule équipe Scrum, sans sous-équipe ni hiérarchie interne*

* **Product Owner** : Maximise la valeur et gère efficacement le Product Backlog
* **Scrum Master** : Établit Scrum et améliore l'efficacité de l'équipe et de l'organisation
* **Developers** : Créent l'incrément, adaptent leur plan et répondent de sa qualité.

**Le sprint donne le rythme**\
cycle de travail de durée fixe

Quatres temps structurent l'inspection et l'adaptation :

1. **Sprint planning**
2. **Daily scrum**
3. **Sprint review**
4. **Sprint retrospective**

Ces phases permettent d'inspecter le produit (1. 2. et 3.) et la manière de travailler (4.)

**Definition of Done**\
Une barre de qualité commune : description formelle de l'état de l'incrément lorsqu'il satisfait les mesures de qualité requises.

* **Transparence**  : tout le monde comprend ce que terminé signifie
* **Limite** : Si la DoD n'est pas satisfaite, le travail ne fait pas partie de l'incrément

Exemple :

**Un élément est terminé lorsque :**

* les critères d'acceptation passent
* les tests automatisés pertinents passent
* le code a été relu
* la documentation utile est à jour
* l'incrément est intégré et déployable

**Ce qui n'est pas une DoD suffisante :**

* le développeur a fini
* ça marche sur mon poste
* les tests seront faits plus tard
* une checklist impossible à appliquer

## Kanban

Optimiser le flux, visualiser le travail, fluidifier l'avancement, améliorer progressivement

Kanban ne prescrit ni rôles ni itérations

**On part de l'existant**, les responsabilités réunions et processus actuels peuvent rester en place. 

**On améliore le flux** en observant où le travail attend, ralentit ou se bloque. 

Kanban s'applique à un service existant sans imposer de remplacer immédiatement son organisation. 

**Les pratiques essentielles de Kanban**

| Visualiser                                | Limiter le WIP                 | Gérer le flux                   | Améliorer                                              |
| :---------------------------------------- | :----------------------------- | :------------------------------ | :----------------------------------------------------- |
| rendre le workflow et le travail visibles | controler le travail commencer | observer blocages, âge et débit | tester un changement et mesurer son effet sur le flux  |

*Mesures utiles : WIP, temps de cycle, âge des éléments en cours.*

| à faire | en cours WIP2 | à valider WIP2 | terminé |
| :------ | :------------ | :------------- | :------ |
|         |               |                |         |

Permet de voir les goulots et le travail global

**Terminer davantage produit plus de valeur et accélère le feedback.**

## Bilan

|                 | Cascade / V                | Scrum                        | Kanban                       |
| :-------------- | :------------------------- | :--------------------------- | :--------------------------- |
| **Structure**   | phases et jalons           | sprints et objectifs         | workflow continu             |
| **Changements** | contrôlé formellement      | entre et pendant les sprints | selon la capacité et règles  |
| **Feedback**    | aux revues et validations  | chaque sprint                | par le flux et la livraison  |
| **Force**       | traçabilité                | cadence d'apprentissage      | fluidité et visibilité       |
| **Risque**      | retour opérationnel tardif | scrum mécanique              | tableau sans maîtrise du WIP |

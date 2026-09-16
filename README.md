# Revenus

Tableau de bord personnel des revenus par activité — achat-revente Vinted,
création de sites, abonnements SaaS, allocation chômage. PWA installable,
mono-utilisateur, pensée pour le téléphone d'abord.

## Le principe

**Chaque revenu porte deux dates.** `occurred_on` est le jour de la vente,
`received_on` le jour où l'argent arrive sur le compte. L'application sait
donc répondre à deux questions différentes :

| Base | Ce qu'elle compte | À quoi elle sert |
|---|---|---|
| **Encaissé** | l'argent au jour du versement | ce qu'il y a réellement eu sur le compte ce mois-ci |
| **Comptabilisé** | la vente au jour où elle est conclue | ce que le mois a produit, indépendamment des délais |

Une vente conclue le 28 septembre et versée le 3 octobre compte en septembre
d'un côté, en octobre de l'autre. C'est exactement l'écart qui fausse un
suivi mensuel quand on ne tient qu'une seule des deux dates.

Le sélecteur de base n'apparaît dans l'en-tête **que lorsqu'il change
quelque chose** : tant que chaque montant est saisi comme déjà encaissé, les
deux lectures se confondent et le réglage resterait décoratif.

## Saisie

Le mode de saisie courant est le **journal d'encaissements** : à chaque fois
que de l'argent arrive, on ajoute une ligne — activité, montant, date. Un
même mois porte autant de lignes que nécessaire (plusieurs virements Vinted,
plusieurs factures). Le total du mois est leur somme.

Trois gestes suffisent : l'activité, le montant, enregistrer. « Enregistrer
et continuer » garde l'activité et la date pour enchaîner les saisies. Le
reste — coût d'achat, frais, client, date de vente distincte — est replié.

Une écriture peut aussi être enregistrée **avant** son versement (un client
facturé à 30 jours). Elle rejoint alors la file « en attente », avec une date
d'encaissement prévue déduite du délai de l'activité, et se confirme d'un
clic pour tout un lot — ou automatiquement quand le versement est fiable.

## Architecture

```
src/
  app/
    (app)/            écrans protégés : tableau de bord, journal,
                      analyse, activités, réglages
    connexion/        code à six chiffres par email
    auth/callback/    échange du lien de connexion contre une session
    manifest.ts       manifeste PWA
  components/
    store.tsx         état client : tout est calculé en mémoire
    charts/           graphiques SVG, sans dépendance
    ui/               briques d'interface et jeu d'icônes
  lib/
    analytics.ts      agrégats, écarts, projections, constats
    dates.ts          dates en chaînes, jamais d'objet Date
    format.ts         euros, pourcentages, saisie
    actions.ts        mutations serveur
supabase/migrations/  schéma, politiques RLS, amorçage du compte
```

**Tout est chargé d'un coup au démarrage, puis calculé côté client.** Un
suivi personnel tient dans quelques milliers de lignes ; changer de mois, de
filtre ou de base de calcul ne déclenche donc aucun aller-retour réseau.

**Les montants sont des entiers en centimes.** Aucun flottant ne touche à de
l'argent.

**Les dates sont des chaînes `AAAA-MM-JJ`.** Aucun objet `Date` n'entre dans
les calculs : c'est ce qui évite qu'une vente de fin de mois bascule dans le
mois suivant à cause d'un fuseau horaire.

## Accès

L'application n'a qu'un utilisateur. Trois verrous indépendants :

1. `OWNER_EMAIL` est vérifiée **avant** tout appel à Supabase — aucune autre
   adresse ne peut même déclencher l'envoi d'un code.
2. Le proxy contrôle l'email de la session à chaque requête et **détruit**
   toute session étrangère plutôt que de se contenter de rediriger.
3. Les politiques RLS restreignent chaque ligne à `auth.uid()`.

## Mise en route

```bash
npm install
cp .env.example .env.local   # puis renseigner les trois variables
npm run dev
```

Appliquer `supabase/migrations/0001_init.sql` dans l'éditeur SQL du projet
Supabase. Le premier compte créé reçoit ses quatre activités et ses
préférences par défaut : l'application n'est jamais vide au premier écran.

| Variable | Rôle |
|---|---|
| `SUPABASE_URL` | URL du projet |
| `SUPABASE_ANON_KEY` | clé publiable |
| `OWNER_EMAIL` | seule adresse autorisée à ouvrir une session |
| `SITE_URL` | facultatif — origine utilisée par le lien de connexion |

Aucune n'a de préfixe `NEXT_PUBLIC_`, et c'est voulu : l'application ne
contacte Supabase que depuis le serveur — composants serveur pour la
lecture, Server Actions pour l'écriture, proxy pour le rafraîchissement
de session. Le navigateur ne parle qu'à ce serveur. Rien de tout cela
n'est donc embarqué dans le bundle JavaScript.

Ce n'est pas ce qui protège les données : la clé publiable est conçue
pour être exposable, et c'est la RLS qui fait barrage. Mais tant que le
navigateur n'en a pas besoin, autant ne pas l'y envoyer. (Les noms
préfixés restent acceptés en repli, pour qu'un déploiement déjà
configuré ainsi continue de fonctionner.)

## Graphiques

Les graphiques sont écrits à la main en SVG, sans bibliothèque. La palette
catégorielle est validée pour les deux thèmes : écart minimal de 9,1 (clair)
et 8,4 (sombre) entre teintes voisines sous simulation de daltonisme. Trois
teintes claires passent sous le rapport de contraste de 3:1 sur fond clair —
d'où les étiquettes chiffrées et la vue tableau, systématiquement
disponibles, pour qu'aucune valeur ne dépende de la couleur seule.

## Commandes

```bash
npm run dev      # développement
npm run build    # build de production
npm run lint     # ESLint
```

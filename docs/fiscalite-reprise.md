# Ce que la comptabilité savait, avant d'être retirée

Cette app ne tient plus de comptabilité : elle suit et analyse des
revenus, rien d'autre. La comptabilité fera l'objet d'une application
séparée.

Ce fichier existe pour une seule raison : que cette future application
n'ait pas à redemander ce qui était déjà su et vérifié. Les valeurs
ci-dessous étaient celles de la base au 22 septembre 2026, toutes
confirmées à la main.

## Le régime

| Réglage | Valeur |
|---|---|
| Début d'activité | 24 février 2026 |
| ACRE | oui — taux réduit de moitié jusqu'au 31 décembre 2026 |
| Versement libératoire | non, barème classique |
| Parts fiscales | 1 |
| Autres revenus du foyer | 0 |
| Barème utilisé | celui par défaut, jamais personnalisé |
| Déclaration URSSAF | mensuelle |
| Déclarations enregistrées | aucune |

La période d'ACRE court jusqu'à la fin du troisième trimestre civil
SUIVANT celui du début d'activité — ce n'est pas « douze mois ».
Commencée le 24 février 2026, elle s'achève donc le 31 décembre 2026,
et le coefficient est 0,5 parce que l'activité a démarré avant le
1er juillet 2026.

## Les activités et leur catégorie

| Activité | Clé | Nature | Catégorie fiscale | Confirmée |
|---|---|---|---|---|
| Vinted | `vinted` | achat-revente | Vente de marchandises (BIC) | oui |
| Création de sites | `web` | prestation | Prestations libérales (BNC) | oui |
| SaaS | `saas` | abonnement | Prestations libérales (BNC) | oui |
| Allocation chômage | `chomage` | allocation | Revenu de remplacement | oui |

Le classement du SaaS restait à trancher : BNC ou prestations de
services BIC. Le test qui décide tient en trente secondes — ouvrir le
formulaire de déclaration sur autoentrepreneur.urssaf.fr, qui n'affiche
que les lignes correspondant aux activités réellement déclarées au
guichet unique. Sans ligne « prestations de services BIC », la question
est réglée.

## Les taux qui s'appliquaient (2026)

| Catégorie | Cotisations | Formation | Abattement | Plafond micro | Franchise TVA |
|---|---|---|---|---|---|
| Vente de marchandises (BIC) | 12,30 % | 0,10 % | 71 % | 203 100 € | 85 000 € |
| Prestations de services (BIC) | 21,20 % | 0,10 % | 50 % | 83 600 € | 37 500 € |
| Prestations libérales (BNC) | 25,60 % | 0,20 % | 34 % | 83 600 € | 37 500 € |
| Revenu de remplacement | aucune | aucune | 10 % (salaires) | — | — |

Deux pièges que le moteur retiré traitait, et qu'il faudra retraiter :

- Le plancher d'abattement de 305 € est **annuel**. L'appliquer à une
  fenêtre d'un mois le fait jouer douze fois dans l'année.
- L'allocation chômage n'entre dans aucune assiette de cotisations,
  mais elle est imposable, en case 1AP, après le même abattement de
  10 % que les salaires — avec son minimum et son plafond, eux aussi
  annuels.

L'implémentation complète se relit dans l'historique git, au commit
qui précède le retrait de la comptabilité.

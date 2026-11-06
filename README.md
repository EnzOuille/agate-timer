# Agate Timer

Extension Brave/Chrome (Manifest V3) qui affiche, sur `agate-tempo.cnrs.fr`, l'heure à laquelle tu peux partir.

## Installation (Brave)

1. Récupérer le dossier du dépôt (`git clone` ou ZIP décompressé).
2. Ouvrir `brave://extensions`, activer **Mode développeur** (en haut à droite).
3. **Charger l'extension non empaquetée** → sélectionner le dossier du dépôt (celui qui contient `manifest.json`).
4. Ouvrir n'importe quelle page de `agate-tempo.cnrs.fr` : le panneau apparaît en bas à droite.

Après un `git pull`, cliquer sur ⟳ dans `brave://extensions` puis recharger la page oHRis.

## Calcul

```
heures faites = premier badgeage + (théorique + supp − congé − autres crédits) + pause du midi comptée + autres interruptions
départ        = max(heures faites, fin de chaque plage fixe non couverte par un congé)
```

- **Plages fixes** : 9h30–11h30 et 13h30–15h30 par défaut (modifiables dans Réglages). Si les heures sont faites avant la fin d'une plage, le départ est repoussé à la fin de celle-ci. Une plage couverte par un congé (demi-journée du matin ou de l'après-midi) ne compte pas. Arriver après le début d'une plage affiche une simple alerte : le calcul part de l'heure d'arrivée réelle.
- **Congé** : `Auto` lit les absences de la feuille (≥ théorique → journée, sinon demi-journée). On peut aussi saisir le congé à la main pour la journée : demi-journée = moitié du théorique (3h51), journée = théorique (7h42). Une saisie manuelle remplace les absences lues sur la feuille. Pour « Demi-journée » sans précision, la moitié en congé est déduite de l'heure d'arrivée (avant midi → congé l'après-midi).

- **Badgeages** : lus dans la fenêtre « Contrôle des pointages » (`/time/punch/{id}/{date}`), qui liste les badgeages bruts en temps réel (entrée, sortie, entrée…), y compris un pointage en cours ; les badgeages cochés « Supprimer » sont ignorés. Si elle est indisponible, repli sur les pointages clos de la feuille de temps. L'heure d'arrivée peut être forcée à la main.
- **Théorique** : colonne « Théorique » du jour (7h42 par défaut si absente).
- **Autres crédits** : télétravail, compensation… présents sur la ligne du jour.
- **Pause du midi** : entrée « Pause du midi » si présente, sinon écart entre deux pointages chevauchant 11h–14h30, sinon pause en cours (sortie badgée, pas encore de retour), sinon pause prévue (45 min par défaut, modifiable pour la journée). Une pause plus courte que 45 min est comptée 45 min, comme l'écrêtage oHRis. Avec une demi-journée de congé, aucune pause méridienne n'est imposée : ni pause prévue, ni écrêtage (une pause réellement prise est comptée pour sa durée).
- **Heures supp** : saisies pour la journée en cours (`1h30`, `1:30`, `30` = 30 min, ou boutons). Stockées localement, purgées après 14 jours.

## Onglet Mois

Une semaine (lundi → dimanche) compte pour le mois qui contient son **dimanche**, comme le « Différentiel mensuel » de la feuille oHRis (ex. novembre 2026 = du lundi 26/10 au dimanche 29/11).

- **Différentiel à date** : somme de « Effectif − Théorique » sur les jours écoulés de la période, hors aujourd'hui. **Avec aujourd'hui** ajoute la journée en cours en supposant un départ à l'heure prévue (différentiel = heures supp saisies).
- **Sur tout le mois** : théorique de tous les jours de la période − effectif déjà acquis (y compris télétravail ou congés futurs déjà posés) = reste à faire, avec le nombre de jours restants et la moyenne par jour.
- **Solde récupération horaire** : lu dans Absences > Compteur(s).
- **Historique** : « Différentiel mensuel » des 6 mois précédents, lu dans le récapitulatif de chaque feuille (mis en cache : 1h pour le mois précédent, 24h pour les autres).
- **Alerte** : le différentiel mensuel ne peut pas être négatif deux mois d'affilée. Si le mois précédent est négatif et que le mois en cours l'est aussi, alerte rouge (⚠ aussi sur l'onglet et la pastille) avec le temps manquant.

Les données du mois sont relues toutes les 30 minutes ou via ⟳.

Les données de la feuille sont relues toutes les 5 minutes et au retour sur l'onglet. Rien ne sort du navigateur : l'extension ne fait que des requêtes same-origin vers oHRis avec ta session.

## Limites

- Les badgeages sont appariés dans l'ordre (entrée, sortie, entrée…) : un badgeage oublié décale les paires. Corriger dans oHRis ou forcer l'heure d'arrivée.
- Les réglages (plages fixes, pause mini, pause par défaut, alerte > 10h) sont dans « Réglages » en bas du panneau.

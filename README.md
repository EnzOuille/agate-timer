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

- **Plages fixes** : 9h30–11h30 et 13h30–15h30 par défaut (modifiables dans Réglages). Si les heures sont faites avant la fin d'une plage, le départ est repoussé à la fin de celle-ci. Une plage couverte par un congé (demi-journée du matin ou de l'après-midi) ne compte pas. Arriver après le début d'une plage affiche une alerte.
- **Congé** : `Auto` lit les absences de la feuille (≥ théorique → journée, sinon demi-journée). On peut aussi saisir le congé à la main pour la journée : demi-journée = moitié du théorique (3h51), journée = théorique (7h42). Une saisie manuelle remplace les absences lues sur la feuille. Pour « Demi-journée » sans précision, la moitié en congé est déduite de l'heure d'arrivée (avant midi → congé l'après-midi).

- **Premier badgeage** : premier « Pointage » de la ligne du jour dans la feuille de temps. Si rien n'y figure encore (pointage en cours, non clos), l'extension lit la modale « Contrôle des pointages » (`/time/punch/{id}/{date}`) ; la valeur est alors marquée « à vérifier ». Saisie manuelle possible.
- **Théorique** : colonne « Théorique » du jour (7h42 par défaut si absente).
- **Autres crédits** : télétravail, compensation… présents sur la ligne du jour.
- **Pause du midi** : entrée « Pause du midi » si présente, sinon écart entre deux pointages chevauchant 11h–14h30, sinon pause en cours (sortie badgée, pas encore de retour), sinon pause prévue (45 min par défaut, modifiable pour la journée). Une pause plus courte que 45 min est comptée 45 min, comme l'écrêtage oHRis. Pas de pause prévue s'il reste ≤ 6h à faire (demi-journée).
- **Heures supp** : saisies pour la journée en cours (`1h30`, `1:30`, `30` = 30 min, ou boutons). Stockées localement, purgées après 14 jours.

Les données de la feuille sont relues toutes les 5 minutes et au retour sur l'onglet. Rien ne sort du navigateur : l'extension ne fait que des requêtes same-origin vers oHRis avec ta session.

## Limites

- La structure HTML de la modale « Contrôle des pointages » n'est pas documentée : l'extraction des heures y est tolérante (toutes les heures `HHhMM`/`HH:MM` des cellules). En cas de valeur farfelue, forcer l'heure d'arrivée à la main.
- Les réglages (pause mini, pause par défaut, seuil sans pause, alerte > 10h) sont dans « Réglages » en bas du panneau.

# 📈 Stock & Crypto Tracker — Suivi Revolut Simplifié

> Une application épurée et sans graphiques superflus pour suivre vos investissements Revolut (actions & cryptos), visualiser la progression jour par jour en couleurs, et obtenir des recommandations claires de décision (**Garder**, **Prendre des bénéfices**, **Stop-Loss**).

---

## 🎯 Pourquoi cette application ?

Les applications de courtage comme **Revolut** affichent le gain global depuis l'achat, mais posent 3 problèmes majeurs au quotidien :
1. **On ne sait pas si c'était plus haut ou plus bas la veille** : impossible de savoir en un coup d'œil si vos gains s'effritent depuis 3 jours ou s'ils continuent de grimper.
2. **Les graphiques en chandeliers ou en courbes sont fatigants** : quand on cherche la clarté, un tableau épuré avec des pastilles de couleur jour par jour est infiniment plus lisible.
3. **Aucune aide à la décision concrète** : savoir quand sécuriser des gains ou couper une perte selon votre propre stratégie.

---

## ✨ Fonctionnalités principales

* **Zéro graphique anxiogène** : Un tableau de bord minimaliste, fluide et moderne (typographie Apple / SF Pro).
* **Historique jour par jour (7j, 14j, 21j, 30j)** :
  * Pastille 🟢 **Verte** : cours supérieur à la veille.
  * Pastille 🔴 **Rouge** : cours inférieur à la veille.
  * Pastille ⚪ **Grise** : cours stable.
  * Indicateur de série : *« 🔥 3 jours de hausse d'affilée »* ou *« ❄️ 3 jours de baisse consécutive »*.
* **Moteur de suggestion intelligent (Acheter / Garder / Vendre)** :
  * 🟢 **Garder** : dynamique saine ou stable.
  * 🟡 **Prendre des bénéfices** : objectif de gain atteint avec essoufflement récent pour sécuriser vos profits.
  * 🟠 **Alerte Baisse** : baisse constatée sur $N$ séances d'affilée.
  * 🔴 **Stop-Loss** : perte globale dépassant votre seuil critique pour protéger votre capital.
  * 🔵 **Opportunité / Renforcer** : repli temporaire sur un titre globalement performant.
* **Critères 100% personnalisables** : Panneau de réglages avec curseurs en direct (objectif de profit %, stop-loss %, nombre de jours de baisse consécutifs).
* **Recherche & Autocomplétion en direct** : Tapez simplement *« Apple »*, *« Tesla »*, *« LVMH »*, *« Bitcoin »* pour trouver le bon symbole en 1 seconde.
* **Conversion automatique des devises** : Conversion temps réel en Euros (€) même pour les actions cotées en USD ou GBP.
* **Sauvegarde locale automatique** : Toutes vos positions sont enregistrées localement dans `data/portfolio.json`.
* **Thème Sombre & Thème Clair** : Harmonisé avec un design moderne et soigné.
* **Zéro installation lourde** : Fonctionne directement avec Node.js natif sans `node_modules` volumineux.

---

## 🚀 Démarrage rapide

### 1. Cloner le projet
```bash
git clone https://github.com/ncgimenez/stock-tracker.git
cd stock-tracker
```

### 2. Lancer l'application
```bash
npm start
```
*(ou simplement `node server.js`)*

### 3. Ouvrir dans votre navigateur
Rendez-vous sur :
👉 **[http://localhost:3001](http://localhost:3001)**

---

## 📱 Utilisation

1. **Ajouter un achat** :
   * Cliquez sur **« Ajouter un achat »**.
   * Tapez le nom de l'action ou de la crypto (*ex: LVMH*).
   * Indiquez la **date d'achat** et le **montant total investi** (ou le nombre d'actions).
   * Enregistrez : le cours actuel et l'historique complet sont récupérés automatiquement !
2. **Visualiser la tendance** :
   * Choisissez la période souhaitée grâce aux boutons : **7 jours**, **2 semaines**, **3 semaines**, **1 mois**.
   * Consultez les pastilles pour voir immédiatement si la valeur monte ou descend de jour en jour.
3. **Personnaliser les critères** :
   * Cliquez sur **« Critères »** en haut à droite.
   * Ajustez vos seuils de prise de bénéfices (ex: `+15%`) et de stop-loss (ex: `-10%`).

---

## 🛠️ Architecture technique

* **Backend** : Node.js (modules natifs `node:http`, `node:fs`), architecture REST, cache mémoire anti-rate limit.
* **Données financières** : API temps réel Yahoo Finance (cotations mondiales & taux de change EUR).
* **Frontend** : HTML5 sémantique, CSS moderne avec variables thématiques (Dark / Light), JavaScript Vanilla ultra-léger et réactif.
* **Persistance** : Fichier JSON structuré `data/portfolio.json`.

---

## 📄 Licence

MIT © [Nadia Canadas Gimenez](https://github.com/ncgimenez)

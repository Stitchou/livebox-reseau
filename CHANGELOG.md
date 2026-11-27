## 0.7.6 — suppression du mapping manuel

- Retire « ⚙ Configurer » de la fiche des appareils : seuls « Fiche HA » et la fermeture restent disponibles.
- Supprime le formulaire de mapping manuel et le filtre « Masqués », qui dépendait de ce formulaire.
- La hiérarchie Orange et les associations Linksys sont les seules sources utilisées pour la topologie ; les anciens `overrides` de HAOS ne modifient plus les noms, parents, groupes ou liaisons.
- Préserve sans les effacer les anciens réglages dans `.storage/livebox_reseau_map` pour permettre un retour arrière.
- Corrige l'URL de ressource Lovelace automatique vers `?v=0.7.6` (elle était restée en `0.7.4` dans le backend).
- Aucun changement des algorithmes de regroupement CPL/Velop, des valeurs Recorder ou de la topologie source Orange.
- Ajoute des tests de non-régression et un test de la fiche appareil sans bouton de configuration.

## 0.7.5 (développement) — encadrement générique des descendants HomePlug

- Corrige le rendu des CPL non TP-Link : un `HomePlug` avec des équipements ordinaires en descendants (notamment Cudy et clients) crée une zone violette « Équipements derrière CPL » même sans radios `_2.4` / `_5`.
- Conserve exactement les parents/enfants Orange : le Cudy et ses voisins ne sont pas déclarés automatiquement clients Wi-Fi du Cudy.
- Les CPL ne desservant que d'autres CPL conservent leurs liaisons directes sans cadre inutile.
- Aucun changement des groupes TP-Link multiradio, des Velop Linksys, du stockage HAOS ou du backend Orange.
- Tests Chromium PC/mobile et tests de non-régression v0.7.4 ; validation réelle du CPL_JARDIN confirmée le 27/11/2026.

## 0.7.4 — topologie Orange et clients Linksys

- Supprime les règles fixes par ETH et les listes figées de noms de Velop/clients.
- Conserve les vrais parents déclarés par la Livebox via `TopologyDiagnostics → Children` ; les nœuds « Ethernet » sans identité ne deviennent pas des hubs artificiels.
- Ajoute la reconnaissance par `DeviceType: HomePlug`, sans heuristique sur « CPL » dans le nom. Les HomePlug sont violets, même lorsqu'ils sont des nœuds terminaux.
- Conserve les adaptateurs et interfaces CPL séparément. `Spare1_2.4` et `Spare1_5` se présentent sous un cadre CPL, avec leurs clients quand la hiérarchie le permet.
- Consomme les capteurs `Connected Devices` de l'intégration Linksys : rattachement par MAC des clients **wireless uniquement**, avec bandes et RSSI. Ignore les `wired` et les MAC revendiquées par deux Velop.
- Récupère un inventaire restreint des équipements du coordinateur Orange même lorsque leurs `device_tracker` sont désactivés.
- Bouton Actualiser avec contournement du cache 15 min, limité à une lecture de topologie toutes les 45 secondes.
- Compteurs CPL corrigés, liaisons SVG vers les HomePlug violettes, affichage responsive PC et mobile conservé.
- Conservation de `.storage/livebox_reseau_map`, aucune modification de Recorder et aucune commande réseau destructive.
- Tests Python, logique JavaScript et rendu Chromium sur données fictives ; vérification visuelle sur Livebox 7 réelle après installation. Les cas multiradio CPL et second Cudy restent à confirmer.

## 0.7.3 (développement) — suivi automatique des ports et rattachements prudents

- Suppression des ports ETH2/ETH4 codés en dur pour CPL Master/Spare1 et Velop RDC.
- Quand CPL Master change d'ETH, Spare1 et Spare1_2.4 suivent ce port, même si le traceur de la radio présente encore un ancien ETH.
- Les clients CPL explicitement retrouvés comme descendants `Children` suivent aussi la branche du CPL Master.
- Regroupement des clients de Velop à partir de `wifi_bridge` seulement si un seul Velop plausible et aucun intermédiaire concurrent.
- Les clients inconnus restent non attribués plutôt que reliés à un faux parent.
- Les liaisons déjà personnalisées dans HAOS continuent à primer.
- Aucun changement du dessin SVG, de la base Recorder ni des commandes WebSocket.

## 0.7.2 — Regroupement Velop RDC et chaînage CPL Master → Spare1

- ETH2 : le Velop RDC redevient automatiquement parent de ses clients Wi-Fi, y compris si le dashboard conserve une ancienne option `auto_velop_rdc: false`.
- Nouvelle option explicite `group_velop_rdc: false` dans l’éditeur visuel pour désactiver volontairement cette règle.
- ETH4 : `CPL Spare1` est maintenant enfant de `CPL Master` (les deux en violet), même si le diagnostic Livebox les présentait au même niveau. Un trait SVG violet relie réellement les deux bulles. La relation est une règle locale, pas une découverte automatique universelle.
- `Spare1_2.4` reste fusionné dans Spare1 et lui fournit son IP ; le groupe des clients CPL reste violet.
- Les corrections individuelles HAOS restent prioritaires ; Velop Garage, les autres branches, les tracés SVG arrondis et le stockage sont préservés.

## 0.7.1 — Raccords réseau arrondis (correctif visuel)

- Tronc Livebox → ETH dessiné par SVG : aucun dépassement au-dessus du premier port ou sous le dernier.
- Sorties des ports et connexions des groupes CPL/Wi-Fi reliées par des courbes calculées sur la géométrie réelle des éléments.
- Recalcul après changement de largeur et déploiement/repli des branches.
- Aucune modification des données Livebox, du stockage partagé ni des règles Velop/CPL de la 0.7.0.

# Historique des versions

## 0.7.0 — développement (non publié en release)

- Nouvelle présentation colorée : branches Ethernet bleues, groupes Wi-Fi verts et groupe Wi-Fi CPL violet fermé.
- Points d'accès à gauche de leurs clients, disposés en grille sans faux liens en chaîne entre clients.
- Regroupement visuel de `CPL Spare1` et `CPL Spare1_2.4` lorsqu'ils sont sur la même branche : conserve l'adresse IP de la seconde entité, les descendants `Children` et les entités HA d'origine.
- Tous les ETH déployables/repliables, disposition sur mobile, sans déplacement manuel des bulles.
- Conservation du stockage partagé HAOS et de l'import `TopologyDiagnostics` de la 0.6.0.
- README et captures de démonstration générés uniquement avec des appareils fictifs.

**Limite :** seule la simulation a été testée. Les associations renvoyées par la Livebox, notamment avec des Velop en mode pont, restent à vérifier sur le réseau réel.

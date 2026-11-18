# Livebox Réseau — topologie dans Home Assistant

[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-int%C3%A9gration%20personnalis%C3%A9e-41BDF5)](https://www.home-assistant.io/)
[![HACS](https://img.shields.io/badge/HACS-d%C3%A9p%C3%B4t%20personnalis%C3%A9-41BDF5)](https://www.hacs.xyz/)
![Statut](https://img.shields.io/badge/statut-d%C3%A9veloppement-orange)

**Version de développement 0.7.2 — non publiée en release GitHub et non encore validée sur une Livebox 7 réelle.**

Cette intégration fournit une **carte Lovelace** pour représenter les équipements réseau visibles dans Home Assistant. Elle affiche les interfaces de la Livebox, les équipements intermédiaires reconnus et leurs enfants lorsque des liens sont disponibles. Les appareils sont organisés automatiquement : **pas de placement manuel des bulles**. Les sous-réseaux sont présentés dans des encadrés colorés, sans transformer artificiellement les clients en une chaîne de connexions.

## Aperçu (noms entièrement fictifs)

![Capture de démonstration fictive de Livebox Réseau, interfaces ETH0 à ETH4 ouvertes, switch, points d'accès Wi-Fi et groupe CPL violet](assets/topologie-exemple-fictif.png)

*Capture du rendu de la carte v0.7.2 dans un navigateur de test, alimentée par **25 entités et une arborescence `Children` simulées**. Tous les noms sont génériques (« NAS », « Serveur », « CPL Master », « CPL Spare1 », « Capteur jardin »…), toutes les adresses sont réservées à la documentation (`192.0.2.0/24`). **Aucune donnée provenant d'un réseau personnel n'est utilisée.** Les liens CPL et Wi-Fi illustrés sont fictifs ; ils ne sont pas une preuve de branchements réels.*

Sur PC, **toutes les interfaces sont déployées au départ**. Les 25 entités de l’exemple ne produisent que **24 bulles physiques**, car le réseau `CPL Wi-Fi_2.4` est fusionné avec son adaptateur CPL. Sur téléphone, les interfaces sont **repliées au départ** pour limiter le défilement. Les boutons **Tout déployer** et **Tout replier** permettent de modifier cet affichage ; les branches restent consultables individuellement.

## Dépendance obligatoire

L'intégration externe **[Orange Livebox pour Home Assistant, par cyr-ius (`cyr-ius/hass-livebox-component`)](https://github.com/cyr-ius/hass-livebox-component)** doit déjà être **installée, configurée et fonctionnelle**.

Cette dépendance n'est **pas installée automatiquement** par HACS avec Livebox Réseau. Il faut activer le **suivi filaire et Wi-Fi**, ainsi que les entités `device_tracker` correspondantes dans Home Assistant. Ces entités fournissent les noms, les états et certains attributs (`ip`, `mac`, `interface_name`, `connection`, `frequency_band`). La carte écarte les traceurs GPS. Il est possible que certains attributs manquent pour un appareil.

Pour importer les liens, le composant cherche à réutiliser la session authentifiée de cette intégration Orange et son API interne `TopologyDiagnostics`. **La compatibilité dépend de la version installée de l'intégration Orange et du firmware Livebox.**

## Correctif 0.7.2 — Velop RDC et hiérarchie CPL

Sur certaines installations mises à jour, une ancienne option `auto_velop_rdc: false`
restait dans le YAML du dashboard et empêchait le regroupement des clients Wi-Fi
sur **Velop RDC**. Le regroupement des appareils **ETH2 → Velop RDC** est désormais
**activé par défaut, sans intervention manuelle**, même si l'ancien paramètre vaut `false`.
Pour le désactiver délibérément, le nouvel éditeur visuel enregistre
`group_velop_rdc: false`. Les corrections individuelles de parent déjà définies
dans Home Assistant restent prioritaires.

Sur ETH4, les deux équipements reconnus par les noms `CPL Master` et `CPL Spare1`
sont désormais reliés par une **règle locale confirmée** :
**ETH4 → CPL Master (violet) → CPL Spare1 (violet) → groupe Réseau Wi-Fi CPL (violet)**.
La bulle `CPL Spare1_2.4` est fusionnée avec `CPL Spare1` et fournit l'IP
lorsqu'elle est la seule à en avoir une. Le trait Master → Spare1 indique une
relation **confirmée par la configuration décrite par l'utilisateur** : il ne
faut pas le présenter comme une détection universelle de `TopologyDiagnostics`.
La règle n'est appliquée que si les deux adaptateurs sont sur la même branche
`ETH4`, et peut être corrigée depuis la fiche de l'appareil. Le stockage partagé
et les autres branches ne changent pas.

## Correctif 0.7.1

Les raccords du graphe sont dessinés en courbes SVG recalculées après un déploiement/repli et lors du redimensionnement. Le tronc bleu s’arrête désormais à la première et à la dernière interface, sans dépassement. Le correctif ne change aucun lien `Children` ni réglage enregistré.

## Fonctionnalités de la version 0.7.2

| Fonction | Comportement réel |
| --- | --- |
| Inventaire | Lit les `device_tracker` Home Assistant possédant `source_type: router` et les attributs réseau attendus. Le code ne vérifie pas formellement l'intégration d'origine de chaque tracker. |
| État des appareils | Affiche le nom, l'IP quand elle est connue et le statut `home` / `not_home`. |
| Topologie automatique | Tente d'extraire les relations `Children` de `TopologyDiagnostics`, puis rapproche les équipements des trackers par **MAC** et cohérence de branche. Les intermédiaires inconnus ne sont pas inventés par un simple scan IP. |
| Présentation | Livebox → interfaces ETH/Wi-Fi → équipements et sous-branches. Les groupes **Wi-Fi sont encadrés en vert**, le groupe **CPL Wi-Fi en violet**, et les branches Ethernet en bleu. Tous les ETH peuvent être ouverts simultanément. |
| Switchs / CPL / points d'accès | Peuvent apparaître comme **nœuds parents** lorsqu'un lien exploitable est reconnu. `CPL Spare1` et `CPL Spare1_2.4` peuvent être fusionnés visuellement sans perte de l'IP ni de leurs descendants. La reconnaissance matérielle n'est pas garantie. |
| Navigation | Recherche, filtres, clic sur un appareil, **Tout déployer / Tout replier**, affichage adapté au téléphone. Il n'y a **pas de déplacement individuel des bulles** ni de zoom global dans cette nouvelle présentation. |
| Personnalisation | Possibilité de corriger le nom, l'interface, le parent, le type de liaison ou de masquer un équipement, depuis sa fiche dans la carte. Les corrections passent avant les liens importés. |
| Stockage PC / mobile | Corrections enregistrées côté Home Assistant, dans `.storage/livebox_reseau_map`, puis partagées par WebSocket entre les écrans connectés. Aucun export YAML n'est requis après chaque correction. |
| Éditeur Lovelace | Éditeur visuel pour le titre, le nom/IP affichés du routeur et les options de regroupement héritées des versions précédentes. |
| Diagnostic | JSON à copier présentant les relations parent/enfant, en remplaçant les identifiants par `N1`, `N2`… et en retirant les IP et MAC. **Les noms des appareils restent visibles dans le diagnostic.** |


### Groupes colorés dans la v0.7.2

- **Bleu** : Livebox et interfaces Ethernet. Une interface identique ne garantit pas un câble direct.
- **Vert** : point d’accès Wi-Fi **à gauche du groupe**, et clients Wi-Fi dans un encadré fermé à droite. Le mode pont des Velop n’est pas détecté de manière fiable par la Livebox ; la règle locale d’association reste distincte de `Children`.
- **Violet** : `CPL Master` et `CPL Spare1` sont deux bulles violettes reliées dans cet ordre, puis les clients de Spare1 sont dans le cadre fermé « Réseau Wi-Fi CPL ». La liaison Master → Spare1 est une règle locale confirmée, non un lien universel découvert par la Livebox. Les clients sont présentés en grille et non comme une chaîne de liens physiques.

**Fusion CPL Wi-Fi** : si deux entités de la même branche portent des noms compatibles, par exemple `CPL Spare1` et `CPL Spare1_2.4`, la carte n’affiche qu’une seule bulle `CPL Spare1`. Son adresse IP visible vient de `CPL Spare1_2.4` lorsqu’elle est disponible. Les enfants `Children` de la seconde entité sont conservés, tout comme sa présence dans les données HA. Les entités Home Assistant restent inchangées. Aucun regroupement entre interfaces ETH différentes n’est forcé.

Les nombres indiqués dans les en-têtes ETH correspondent aux **entités suivies** ; après fusion, le nombre de bulles physiques peut être légèrement inférieur. Les effectifs des encadrés sont calculés sur les descendants affichés, jamais codés en dur.

### Les liens ne sont pas tous équivalents

- **Interface ETH / Wi-Fi** : interface indiquée par la Livebox. Cela ne prouve **pas** un câble direct.
- **`Children`** : relation déclarée par le diagnostic de la Livebox, pas une vérification physique indépendante.
- **Règle locale Velop / correction manuelle** : rattachement appliqué localement, à distinguer d'un lien réellement fourni par Orange.
- **CPL** : une sous-branche peut être affichée si la relation est présente ou corrigée. Le programme ne détecte pas directement le chemin électrique des adaptateurs CPL.

Les points d'accès **Linksys Velop en mode pont** peuvent être représentés par Orange comme de faux switchs : la carte n'est **pas capable de retrouver avec certitude** le point d'accès Wi-Fi réel de chaque appareil à partir des seules interfaces ETH. Les règles locales héritées des versions précédentes sont spécifiques à certaines configurations et ne doivent pas être assimilées à une découverte universelle.

## Installation HACS

1. Installez et configurez d'abord **[Orange Livebox de cyr-ius](https://github.com/cyr-ius/hass-livebox-component)**.
2. Dans HACS, ajoutez `https://github.com/Stitchou/livebox-reseau` comme **dépôt personnalisé**, catégorie **Intégration**, puis installez Livebox Réseau.
3. Redémarrez **Home Assistant Core** (y compris après la première installation, même si HACS n'affiche pas ce bouton).
4. Dans **Paramètres → Appareils et services → Ajouter une intégration**, ajoutez **Livebox Réseau**. Aucun identifiant Livebox supplémentaire n'est demandé.
5. Dans **Paramètres → Tableaux de bord → Ressources**, vérifiez qu'une ressource de type **Module JavaScript** pointe vers `/livebox-reseau/livebox-topologie-card.js?v=0.7.2`. Le composant tente de la créer automatiquement en mode de ressources Lovelace « stockage » ; ajoutez-la manuellement si nécessaire.
6. Actualisez le navigateur (`Ctrl + Maj + R` dans Firefox), puis ajoutez la carte au tableau de bord.

La carte peut être ajoutée depuis l'éditeur visuel Lovelace. Configuration YAML minimale :

```yaml
type: custom:livebox-topologie-card
title: Mon réseau Livebox
router_name: Livebox 7
router_ip: 192.168.1.1
grid_options:
  columns: full
  rows: auto
```

`router_name` et `router_ip` ne servent qu'à **l'affichage**. Ils ne configurent pas la connexion à la box.

### Mise à jour depuis les v0.5.0 / v0.6.0

Mettez à jour le contenu du dépôt, puis **Télécharger à nouveau** dans HACS. Redémarrez Home Assistant Core pour mettre à jour le composant Python, actualisez le navigateur et vérifiez le paramètre `?v=0.7.2` sur la ressource.

**Ne supprimez ni l'intégration Orange ni `.storage/livebox_reseau_map`** : le stockage des corrections reste compatible. Vous n'avez pas besoin de recréer vos cartes existantes `custom:livebox-topologie-card`.

## Actualisation, diagnostic et stockage

- **Actualiser** appelle le service de topologie depuis la carte. Il reste soumis au **cache serveur de 900 secondes** (15 minutes) : une nouvelle pression ne signifie donc pas nécessairement un nouvel appel effectif à la Livebox.
- **Diagnostic** permet de copier les relations normalisées lorsqu'elles sont disponibles ; les noms demeurent visibles, donc **vérifiez avant partage**.
- Le badge **« Synchronisé HA »** confirme le bon fonctionnement du **stockage des personnalisations**, **pas** la réussite du diagnostic Livebox. La ligne de statut sous la barre d'outils indique distinctement si `TopologyDiagnostics` répond.
- En cas d'échec de cette API interne, le tableau garde un **mode de secours par interfaces** et les modifications déjà enregistrées.
- Aucune nouvelle entité Recorder, aucune modification de MariaDB et aucun service cloud tiers ne sont requis. Il s'agit d'une intégration Home Assistant avec une carte Lovelace, **pas d'un add-on HAOS**.

## Tests et limites de validation

Les tests sont exécutés avec des données **synthétiques**, et non sur un réseau personnel :

```bash
python -m compileall -q custom_components/livebox_reseau
node --check custom_components/livebox_reseau/frontend/livebox-topologie-card.js
pytest -q tests/test_backend.py tests/test_topology.py
node tests/test_grid_options.cjs
node tests/test_v07_logic.cjs
node tests/test_v072_relationships.cjs
python tests/test_v07_ui.py
python tests/test_v071_wires.py
python tests/test_v072_ui.py
```

Le dernier test produit des captures fictives PC et mobile et vérifie les cinq branches ETH, la fusion **CPL Wi-Fi + interface 2,4 GHz** avec son IP héritée, un cadre violet contenant quatre clients, la chaîne CPL maître → CPL Wi-Fi, deux groupes Wi-Fi verts, les clics, les boutons « Tout déployer / Tout replier » et l'absence de débordement horizontal à 375 px.

**Les résultats de simulation ne valent pas validation en production** : la collecte des liens et la pertinence de l'arbre sur une véritable Livebox 7 restent à confirmer, notamment pour les switchs mal identifiés, les CPL et les points d'accès en mode pont.

## Crédits

**[Orange Livebox](https://github.com/cyr-ius/hass-livebox-component)** est une intégration indépendante maintenue par **cyr-ius**. Livebox Réseau la réutilise comme dépendance fonctionnelle, sans en être une extension officielle. Orange et Livebox sont des marques de leurs détenteurs respectifs.

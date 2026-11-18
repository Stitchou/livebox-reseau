# Livebox Réseau — topologie dans Home Assistant

[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-int%C3%A9gration%20personnalis%C3%A9e-41BDF5)](https://www.home-assistant.io/)
[![HACS](https://img.shields.io/badge/HACS-d%C3%A9p%C3%B4t%20personnalis%C3%A9-41BDF5)](https://www.hacs.xyz/)
![Statut](https://img.shields.io/badge/statut-d%C3%A9veloppement-orange)

**Version de développement 0.6.0 — ni stable ni validée sur toutes les configurations de Livebox 7.**

Cette intégration fournit une **carte Lovelace** pour représenter les équipements réseau visibles dans Home Assistant. Elle affiche les interfaces de la Livebox, les équipements intermédiaires reconnus et leurs enfants lorsque des liens sont disponibles. Les appareils sont organisés automatiquement : **pas de placement manuel des bulles**.

## Aperçu (noms entièrement fictifs)

![Capture de démonstration fictive de Livebox Réseau, interfaces ETH0 à ETH4 ouvertes, switch, points d'accès Wi-Fi et sous-branches CPL](assets/topologie-exemple-fictif.png)

*Capture du rendu de la carte v0.6.0 dans un navigateur de test, alimentée par **21 appareils et une arborescence `Children` simulés**. Tous les noms sont génériques (« NAS », « PC », « CPL maître », « CPL secondaire », « Capteur jardin »…), toutes les adresses sont réservées à la documentation (`192.0.2.0/24`). **Aucune donnée provenant d'un réseau personnel n'est utilisée.** Les liens CPL et Wi-Fi illustrés sont fictifs ; ils ne sont pas une preuve de branchements réels.*

Sur PC, **toutes les interfaces sont déployées au départ**. Sur téléphone, les interfaces sont **repliées au départ** pour limiter le défilement. Les boutons **Tout déployer** et **Tout replier** permettent de modifier cet affichage ; les branches restent consultables individuellement.

## Dépendance obligatoire

L'intégration externe **[Orange Livebox pour Home Assistant, par cyr-ius (`cyr-ius/hass-livebox-component`)](https://github.com/cyr-ius/hass-livebox-component)** doit déjà être **installée, configurée et fonctionnelle**.

Cette dépendance n'est **pas installée automatiquement** par HACS avec Livebox Réseau. Il faut activer le **suivi filaire et Wi-Fi**, ainsi que les entités `device_tracker` correspondantes dans Home Assistant. Ces entités fournissent les noms, les états et certains attributs (`ip`, `mac`, `interface_name`, `connection`, `frequency_band`). La carte écarte les traceurs GPS. Il est possible que certains attributs manquent pour un appareil.

Pour importer les liens, le composant cherche à réutiliser la session authentifiée de cette intégration Orange et son API interne `TopologyDiagnostics`. **La compatibilité dépend de la version installée de l'intégration Orange et du firmware Livebox.**

## Fonctionnalités de la version 0.6.0

| Fonction | Comportement réel |
| --- | --- |
| Inventaire | Lit les `device_tracker` Home Assistant possédant `source_type: router` et les attributs réseau attendus. Le code ne vérifie pas formellement l'intégration d'origine de chaque tracker. |
| État des appareils | Affiche le nom, l'IP quand elle est connue et le statut `home` / `not_home`. |
| Topologie automatique | Tente d'extraire les relations `Children` de `TopologyDiagnostics`, puis rapproche les équipements des trackers par **MAC** et cohérence de branche. Les intermédiaires inconnus ne sont pas inventés par un simple scan IP. |
| Présentation | Livebox → interfaces ETH/Wi-Fi → équipements et sous-branches ; compactes, sans traits libres qui se chevauchent. Tous les ETH peuvent être ouverts simultanément. |
| Switchs / CPL / points d'accès | Peuvent apparaître comme **nœuds parents** lorsqu'ils sont présents dans les données et qu'un lien exploitable est reconnu. La reconnaissance matérielle n'est pas garantie. |
| Navigation | Recherche, filtres, clic sur un appareil, **Tout déployer / Tout replier**, affichage adapté au téléphone. Il n'y a **pas de déplacement individuel des bulles** ni de zoom global dans cette nouvelle présentation. |
| Personnalisation | Possibilité de corriger le nom, l'interface, le parent, le type de liaison ou de masquer un équipement, depuis sa fiche dans la carte. Les corrections passent avant les liens importés. |
| Stockage PC / mobile | Corrections enregistrées côté Home Assistant, dans `.storage/livebox_reseau_map`, puis partagées par WebSocket entre les écrans connectés. Aucun export YAML n'est requis après chaque correction. |
| Éditeur Lovelace | Éditeur visuel pour le titre, le nom/IP affichés du routeur et les options de regroupement héritées des versions précédentes. |
| Diagnostic | JSON à copier présentant les relations parent/enfant, en remplaçant les identifiants par `N1`, `N2`… et en retirant les IP et MAC. **Les noms des appareils restent visibles dans le diagnostic.** |

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
5. Dans **Paramètres → Tableaux de bord → Ressources**, vérifiez qu'une ressource de type **Module JavaScript** pointe vers `/livebox-reseau/livebox-topologie-card.js?v=0.6.0`. Le composant tente de la créer automatiquement en mode de ressources Lovelace « stockage » ; ajoutez-la manuellement si nécessaire.
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

### Mise à jour depuis la v0.5.0

Mettez à jour le contenu du dépôt, puis **Télécharger à nouveau** dans HACS. Redémarrez Home Assistant Core pour mettre à jour le composant Python, actualisez le navigateur et vérifiez le paramètre `?v=0.6.0` sur la ressource.

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
python tests/test_v06_ui.py
```

Le dernier test prend les captures fictives PC et mobile, vérifie l'ouverture des cinq branches ETH, la sous-branche **CPL maître → CPL secondaire**, les clics, les boutons « Tout déployer / Tout replier » et l'absence de débordement horizontal à 375 px.

**Les résultats de simulation ne valent pas validation en production** : la collecte des liens et la pertinence de l'arbre sur une véritable Livebox 7 restent à confirmer, notamment pour les switchs mal identifiés, les CPL et les points d'accès en mode pont.

## Crédits

**[Orange Livebox](https://github.com/cyr-ius/hass-livebox-component)** est une intégration indépendante maintenue par **cyr-ius**. Livebox Réseau la réutilise comme dépendance fonctionnelle, sans en être une extension officielle. Orange et Livebox sont des marques de leurs détenteurs respectifs.

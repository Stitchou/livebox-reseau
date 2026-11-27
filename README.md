# Livebox Réseau — topologie pour Home Assistant

[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-int%C3%A9gration%20personnalis%C3%A9e-41BDF5)](https://www.home-assistant.io/)
[![HACS](https://img.shields.io/badge/HACS-d%C3%A9p%C3%B4t%20personnalis%C3%A9-41BDF5)](https://www.hacs.xyz/)
![Version](https://img.shields.io/badge/version-v0.7.6-blue)

**Version 0.7.6 : suppression du bouton « Configurer » et du mapping manuel.** Le regroupement CPL v0.7.5 a été confirmé sur une Livebox 7 réelle le 27 novembre 2026. La v0.7.6 conserve cette topologie ; le retrait du mapping a été validé par les tests automatisés et Chromium, mais reste à confirmer sur HAOS après mise à jour.

Carte Lovelace affichant les ports de la Livebox, les équipements reliés et la hiérarchie des connexions. Les relations sont entièrement automatiques : pas de déplacement manuel des appareils. Les anciens réglages enregistrés dans `.storage/livebox_reseau_map` restent sur disque, mais **ne modifient plus la topologie**. Les options de la carte ne concernent que son titre et les libellés de routeur.

## Aperçu de la carte réelle (données synthétiques)

![Capture de test du composant v0.7.6 dans Chromium, sans nom ni adresse personnelle](assets/topologie-exemple-fictif.png)

*Capture réalisée avec le vrai JavaScript v0.7.6 et des appareils inventés, avec des adresses de documentation `192.0.2.0/24`. L'image n'est pas une maquette artistique et ne représente pas les appareils du réseau réel.*

## Dépendances

- **Obligatoire :** [Orange Livebox pour Home Assistant (`cyr-ius/hass-livebox-component`)](https://github.com/cyr-ius/hass-livebox-component), installée et configurée. L'API interne `TopologyDiagnostics` doit être accessible.
- **Facultative, mais recommandée pour les Velop :** [Linksys Velop (`uvjim/linksys_velop`)](https://github.com/uvjim/linksys_velop). Elle fournit les vrais clients Wi-Fi par nœud dans les capteurs `Connected Devices`.
- **Inutiles pour cette version :** HomePlug AV, TP-Link WPA Powerline, accès administrateur aux CPL ou configuration cloud.

## Fonctionnement de la v0.7.6

### 1. Topologie Orange — source principale

La hiérarchie est importée depuis `TopologyDiagnostics → Children`. **Aucune branche n'est imposée à ETH2, ETH3 ou ETH4** : déplacer un CPL, switch, répéteur ou point d'accès ne nécessite pas de modifier les règles.

Les nœuds matériels sont reconnus à l'aide du champ Orange **`DeviceType`**, notamment :

| Type Livebox | Représentation |
| --- | --- |
| `HomePlug` | Bulle violette (indépendamment du nom) |
| `ExtenderWiFiPlus` | Candidat Velop ; vert lorsque les associations sont disponibles |
| `Switch`, `Switch4`, `Switch8` | Intermédiaire identifié par Orange |
| `Access Point` | Appareil et liaison selon la topologie Orange |
| Autres | Appareil standard ; pas de nœud intermédiaire fictif |

**Exemple concret de structure :** sous un port ETH donné, `CPL Master`, `CPL Spare1` et `Device-2536` sont trois frères si la Livebox les décrit au même niveau. `Device-2536` est violet parce que son `DeviceType` vaut `HomePlug`, même si son nom ne contient pas « CPL ». Un Cudy déclaré dans ses `Children` s'affiche en dessous.

**Correctif v0.7.5 :** pour tout équipement `HomePlug` qui dessert des appareils ordinaires (Cudy, téléphone, prise, etc.), la carte crée automatiquement une **zone violette « Équipements derrière CPL – NOM »**. Les équipements restent rattachés au CPL et au même niveau entre eux si c'est ainsi qu'Orange les déclare. Cela ne les transforme **pas** en clients Wi-Fi du Cudy. Un CPL intermédiaire qui ne dessert que d'autres CPL conserve de simples liaisons, sans cadre superflu.

### 2. Interfaces radio d'un CPL

On conserve les entités de l'adaptateur physique et les interfaces radio, **sans les fusionner**. Les suffixes `_2.4` / `_5` (et quelques variantes orthographiques) ne servent qu'à associer les radios à un **parent déjà identifié comme `HomePlug` par Orange**. Ils ne servent pas à classifier un appareil comme CPL.

```text
Port ETH courant
├── Adaptateur CPL principal (HomePlug)
├── Adaptateur CPL Wi-Fi (HomePlug)
│   └── Réseau Wi-Fi CPL (cadre violet)
│       ├── Adaptateur Wi-Fi_2.4 → clients 2,4 GHz
│       └── Adaptateur Wi-Fi_5   → clients 5 GHz, si présent
└── Autre adaptateur CPL (HomePlug)
    └── Équipements derrière CPL (cadre violet)
        ├── Point d'accès extérieur (si Children le confirme)
        └── Autres appareils déclarés sous cet adaptateur
```

Lorsque **une seule radio** est identifiée sous un adaptateur, les clients directs sous ce même adaptateur sont regroupés dans cette bande. Avec **plusieurs radios**, les clients non attribués explicitement par la Livebox restent sous l'adaptateur plutôt que d'être placés au hasard en 2,4 ou 5 GHz. La v0.7.6 ne sait pas interroger directement les clients Wi-Fi des CPL TP-Link.

### 3. Clients Velop — source Linksys

La carte détecte les capteurs Linksys `sensor.*connected_devices` dont l'attribut `devices` contient des clients. Le capteur est associé à un équipement Orange **déjà identifié comme `ExtenderWiFiPlus`** par la correspondance de son libellé `Connected Devices` et du nom du Velop. Les clients sont ensuite reliés par **MAC exacte**.

Seules les entrées Linksys `type: wireless` sont reconnues comme clients Wi-Fi du Velop. Les entrées `type: wired` (qui peuvent inclure d'autres équipements du LAN en mode pont) **ne sont pas regroupées sous ce Velop**. Si deux capteurs déclarent la même MAC, le rattachement est laissé incertain : on ne devine pas. Le détail de la fiche peut afficher la bande radio, le RSSI et le débit de liaison négocié.

**Limite :** si le capteur Linksys est renommé, absent ou ne fournit pas les clients, les associations Wi-Fi ne peuvent pas être garanties automatiquement. On conserve alors les relations `Children` de la Livebox sans appliquer de corrections manuelles.

### 4. Trackers désactivés

L'intégration lit également l'inventaire déjà présent dans le coordinateur de l'intégration Orange. Les nouveaux appareils peuvent donc être affichés **même si leur `device_tracker` est désactivé dans Home Assistant**, dès lors qu'ils sont connus d'Orange et identifiables par MAC. L'inventaire transmis au navigateur se limite au nom, MAC, IP, type, interface et état actif ; aucun mot de passe ou donnée d'authentification.

### 5. Rafraîchissement, confidentialité, synchronisation

- Cache partagé du diagnostic Orange pendant 15 minutes pour éviter de surcharger la Livebox.
- Bouton **Actualiser** : demande une lecture forcée, limitée côté serveur à **une fois toutes les 45 secondes**.
- Les données Linksys viennent des états Home Assistant existants et ne nécessitent pas de requête réseau supplémentaire depuis la carte.
- Diagnostic exportable **sans MAC ni adresses IP** (mais il conserve les noms, donc à vérifier avant partage public).
- Aucun mapping manuel : la fiche appareil contient uniquement « Fiche HA » et le bouton de fermeture. Les anciens `overrides` HAOS sont préservés pour compatibilité, mais ignorés par la carte.
- Aucun changement au recorder, à MariaDB, aux équipements réseau ou à la politique de purge de Home Assistant.

## Installation avec HACS

1. Ajouter le dépôt GitHub `https://github.com/Stitchou/livebox-reseau` comme **intégration** personnalisée dans HACS si ce n'est pas déjà fait.
2. Installer ou mettre à jour vers **v0.7.6** dans HACS après publication de la release GitHub. En installation manuelle, copier le dossier `custom_components/livebox_reseau` vers `/config/custom_components/livebox_reseau` sans désinstaller l’intégration.
3. Redémarrer uniquement **Home Assistant Core** pour recharger le code Python.
4. Vérifier l'URL de la ressource Lovelace : `/livebox-reseau/livebox-topologie-card.js?v=0.7.6`.
5. Recharger le navigateur (`Ctrl + Maj + R`) si l'ancienne carte est encore dans le cache.

Les mises à jour ne suppriment pas `.storage/livebox_reseau_map`. Une sauvegarde Home Assistant reste recommandée avant toute mise à jour.

## Validation et limites

Tests fournis dans `tests/` :

```bash
python -m compileall -q custom_components/livebox_reseau
pytest -q tests/test_topology.py tests/test_backend.py
node --check custom_components/livebox_reseau/frontend/livebox-topologie-card.js
node tests/test_v074_dynamic.cjs
node tests/test_grid_options.cjs
python tests/test_v074_ui.py
python tests/test_v075_ui.py        # Nécessite Playwright + Chromium
python tests/test_v076_ui.py        # Teste la fiche sans mapping manuel
```

Les scénarios de test comprennent : trois HomePlug au même niveau, nouveau CPL de nom neutre, Cudy et trois appareils frères sous le même CPL avec cadre violet, absence de faux rattachement au Cudy, deux radios distinctes, déplacement ETH, clients Linksys Wi-Fi vs wired, conflit entre deux Velop, inventaire sans tracker et affichage mobile 375 px.

**Non vérifié :** comportement de ce correctif v0.7.5 sur ton HAOS réel, avec le CPL_JARDIN et le Cudy. Le modèle d'attribution par fréquence reste limité par les détails réellement remontés dans `Children`.

## Documentation complémentaire

Historique : [CHANGELOG.md](CHANGELOG.md). Projet : [Stitchou/livebox-reseau](https://github.com/Stitchou/livebox-reseau).

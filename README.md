# Livebox Réseau — carte de topologie pour Home Assistant

[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-int%C3%A9gration%20personnalis%C3%A9e-41BDF5)](https://www.home-assistant.io/)
[![HACS](https://img.shields.io/badge/HACS-d%C3%A9p%C3%B4t%20personnalis%C3%A9-41BDF5)](https://www.hacs.xyz/)
![Statut : développement](https://img.shields.io/badge/statut-d%C3%A9veloppement-orange)

**Version de développement 0.5.0 — non validée sur une Livebox réelle pour l'import complet de topologie.**

Livebox Réseau ajoute une **carte graphique Lovelace** à Home Assistant. Elle présente les appareils remontés par l'intégration **Orange Livebox**, avec leurs noms, adresses IP, états de connexion et interfaces réseau. Depuis la 0.5.0, elle **essaie également d'importer les relations parent/enfant** fournies par le diagnostic de topologie de la Livebox.

Ce projet **n'est pas une reproduction exacte** de la carte « Mon Réseau Local » d'Orange. Il ne découvre pas lui-même les appareils en scannant le réseau et ne peut pas garantir la justesse de leurs connexions physiques. **Les points d’accès Linksys Velop de l’installation de référence sont configurés en mode pont (bridge/AP), pas en mode routeur.**

## Dépendance indispensable : Orange Livebox

Ce projet nécessite l'intégration Home Assistant **[Orange Livebox (`cyr-ius/hass-livebox-component`)](https://github.com/cyr-ius/hass-livebox-component)**, **installée, configurée et fonctionnelle**.

Elle fournit :

- les entités `device_tracker` utilisées pour afficher les appareils, leurs noms et leur présence ;
- les attributs réseau tels que `ip`, `mac`, `interface_name`, `connection` et `frequency_band`, lorsqu'ils existent ;
- une connexion déjà authentifiée à la Livebox, dont Livebox Réseau tente de réutiliser l'API `TopologyDiagnostics`.

**L'intégration Orange doit être installée séparément.** Installer *Livebox Réseau* via HACS **n'installe pas automatiquement** `cyr-ius/hass-livebox-component`. La compatibilité de l'appel de diagnostic dépend de la version de cette intégration et du firmware de la box ; elle n'est pas garantie.

Dans les options d'Orange Livebox, activez le **suivi Wi-Fi** et le **suivi filaire**. Les entités `device_tracker` nécessaires doivent aussi être **activées** dans Home Assistant. Si elles n'apparaissent pas immédiatement, laissez l'intégration actualiser les états. Le projet ne dépend pas des traceurs GPS des téléphones.

## Fonctionnalités réellement présentes en 0.5.0

| Fonction | Comportement actuel |
| --- | --- |
| Inventaire réseau | Lit les `device_tracker` disponibles dans les états HA dont `source_type` vaut `router` et qui disposent d'informations d'interface/connexion. Le filtrage ne vérifie pas formellement l'identité de l'intégration source. |
| Noms, IP, MAC, présence | Utilise les attributs fournis par HA ; `home` est traité comme « en ligne ». L'IP ou la MAC peuvent manquer. |
| Carte graphique | Affiche la Livebox et des branches par interface (`ETH0`, `ETH1`, etc. ou Wi-Fi), puis les appareils. Les branches sont ouvrables et le graphe possède zoom, déplacement, recherche et filtres. |
| Topologie Livebox (nouveauté 0.5.0) | Tente l'appel `TopologyDiagnostics` via la connexion de l'intégration Orange. Convertit la réponse `Children` en nœuds avec relations de parenté. |
| Rattachement automatique | Associe les nœuds aux appareils HA par **adresse MAC** et ne conserve un lien importé que si sa branche est cohérente avec le groupe d'interface connu. |
| Switchs, ponts, CPL | Peut représenter des nœuds intermédiaires **présents dans la réponse Livebox**, identifiés par leur nom ou leurs marqueurs. Ce n'est pas une identification matérielle certaine. |
| Velop RDC (mode pont) | Si `auto_velop_rdc` est activé et que « Velop RDC » est présent sous `ETH2`, la carte place **les autres appareils du même groupe ETH2** sous lui. Le code marque ces liens comme Wi-Fi, **sur la base d'une règle propre à cette installation** : il ne lit pas la liste réelle des stations associées au Velop. |
| Velop Garage (mode pont) | Si `auto_velop_garage` est activé et que « Velop Garage » est détecté, la carte place sous lui les noms **explicitement prévus dans le code** (Titan, Titan 2, Alexa bureau, congélateur, pompe piscine) lorsqu'ils sont dans le même groupe d'interface. Il s'agit de rattachements indiqués par l'utilisateur, **pas d'une découverte des clients Wi-Fi par l'API Livebox**. |
| Corrections individuelles | Depuis un appareil dans la carte : nom affiché, branche, parent, type de liaison, masquage. Les réglages saisis priment sur les liens importés. |
| Synchronisation PC / mobile | Enregistre les corrections via WebSocket dans le stockage interne de Home Assistant et transmet les modifications aux cartes ouvertes. Pas d'export YAML après chaque modification. |
| Éditeur visuel | Permet de modifier le titre, le nom et l'IP affichés du routeur, ainsi que l'activation des deux règles Velop. La correction des appareils se fait dans le graphe, pas dans cet éditeur. |
| Diagnostic | Produit un JSON à copier avec identifiants remplacés par `N1`, `N2`…, **sans IP ni MAC**, mais en conservant les noms, types, marqueurs et relations. |

### Ce que la carte ne fait pas

- Elle **n'importe pas le dessin ni les coordonnées** de la carte Orange ; elle reconstruit sa propre disposition graphique.
- Elle ne connaît pas forcément le point d'accès Wi-Fi réel derrière un faux « Switch » de la Livebox, notamment pour les **Linksys Velop en mode pont**. Les clients associés en Wi-Fi peuvent être signalés sur une interface `ETHx` comme des appareils du même segment Ethernet.
- Elle ne vérifie pas physiquement les liens Ethernet ou CPL et ne distingue pas toujours les équipements derrière un switch non administrable.
- Elle ne récupère pas automatiquement les noms d'appareils qui n'existent pas dans les entités HA disponibles et ne scanne pas le sous-réseau par ARP, ping ou SNMP.
- Elle **n'ajoute pas de capteurs ou de nouvelles statistiques** à Recorder. Elle n'envoie pas les données réseau à un service cloud tiers.

## Cas particulier : Linksys Velop en mode pont

Dans l'installation de référence, **Velop RDC** et **Velop Garage** fonctionnent en **mode pont** (*Bridge Mode / mode point d'accès*), et non comme routeurs distincts. Les clients Wi-Fi de ces bornes se trouvent donc sur le **même réseau local** que la Livebox, qui continue de fournir la connectivité IP du LAN. Ils ne forment pas un sous-réseau routé séparé par les Velop.

Cela a une conséquence directe pour la topologie : la Livebox peut voir un ensemble d'appareils derrière un même port `ETHx` ou un **nœud « Switch » générique**, sans savoir quelle station Wi-Fi est associée à quelle borne Velop. Un port `ETHx` ne permet **pas** de conclure que l'appareil est câblé, ni d'identifier son point d'accès sans autre donnée.

Dans la version **0.5.0**, les deux regroupements Velop sont donc des **règles locales optionnelles** fondées sur la connaissance de l'installation :

- **Velop RDC :** sous `ETH2`, les autres appareils de ce groupe sont rattachés à Velop RDC lorsque `auto_velop_rdc` est activé.
- **Velop Garage :** les appareils explicitement nommés dans la règle sont rattachés à Velop Garage lorsqu'ils sont dans la même branche et que `auto_velop_garage` est activé.

Ces règles **ne détectent pas automatiquement les associations Wi-Fi en cours** et peuvent devenir inexactes si un appareil change de borne, si la Livebox modifie son classement ou si un autre appareil filaire partage la branche. La carte conserve les corrections manuelles prioritaires. Les relations du **switch Mercusys** et des **CPL** peuvent être reprises de `Children` lorsqu'elles sont présentes et compatibles, mais elles ne sont pas considérées comme physiquement vérifiées.

## Fonctionnement de l'import de topologie

1. Le composant Python cherche une instance chargée de l'intégration Home Assistant `livebox` dont le coordinateur expose une API.
2. Il appelle `topologydiagnostics.async_set_topodiags_build` avec une demande de diagnostic, **sans reconfigurer la Livebox**.
3. Il extrait les éléments `Children`, leurs parents, certains noms, MAC et marqueurs ; le résultat est limité en taille et ne contient pas la réponse brute de la box.
4. La carte rapproche cette structure des `device_tracker` **par MAC**, puis n'affiche que les liens compatibles avec les interfaces connues. Les équipements sans correspondance sûre peuvent rester rattachés à leur branche ETH/Wi-Fi.
5. Les corrections manuelles et les règles Velop ont priorité sur les liens déduits.

**Important :** `ETH2` signifie « interface ETH2 déclarée par la Livebox » et **pas nécessairement un câble direct** entre la box et chaque appareil. Dans cette installation, des clients des **Velop configurés en pont** apparaissent justement derrière des interfaces Ethernet. Un nœud nommé « Switch » dans `TopologyDiagnostics` peut donc être un regroupement générique créé par Orange, et non un véritable switch identifié.

La topologie est **mise en cache 15 minutes en mémoire**. Le bouton **« ↻ Topologie Livebox »** relance la demande depuis la carte, **mais ne force pas la suppression de ce cache** : avant son expiration, il peut afficher la même réponse. Lorsqu'un diagnostic échoue, la carte peut revenir au regroupement par interfaces et conserver les personnalisations ; si un cache précédent existe, le serveur peut le renvoyer comme périmé.

**État de validation :** les structures et les appels sont testés avec des réponses **simulées**. L'extraction et le rattachement complets via la véritable API d'une Livebox 7 **restent à valider sur une installation HAOS réelle**.

## Installation

### 1. Prérequis

- Home Assistant et HACS fonctionnels. Le fichier `hacs.json` du dépôt indique Home Assistant **2026.11.0** comme version minimale déclarée ; les versions antérieures ne sont pas validées ici.
- [Orange Livebox de cyr-ius](https://github.com/cyr-ius/hass-livebox-component) déjà configurée dans **Paramètres → Appareils et services**.
- Suivi Wi-Fi et filaire activés ; des entités `device_tracker` Orange activées et disposant de leurs attributs.

### 2. Installer Livebox Réseau avec HACS

1. Dans HACS, ajoutez `https://github.com/Stitchou/livebox-reseau` comme **dépôt personnalisé** de type **Intégration**.
2. Installez **Livebox Réseau** depuis la branche de développement ; aucune release stable n'est encore publiée.
3. **Redémarrez Home Assistant Core**, y compris lors de la première installation, même si HACS ne propose pas le bouton.
4. Dans **Paramètres → Appareils et services → Ajouter une intégration**, ajoutez **Livebox Réseau**. Cette étape active notamment le stockage partagé ; **aucun mot de passe Livebox supplémentaire n'est demandé**.
5. Dans **Paramètres → Tableaux de bord → Ressources**, vérifiez la présence d'une seule ressource JavaScript de type **Module** : `/livebox-reseau/livebox-topologie-card.js?v=0.5.0`. L'intégration essaie de la créer automatiquement en mode de ressources Lovelace « stockage ». Ajoutez-la manuellement si nécessaire.
6. Rechargez le navigateur (`Ctrl + Maj + R` sur Firefox), puis ajoutez la carte au dashboard.

### 3. Carte Lovelace

```yaml
type: custom:livebox-topologie-card
title: Mon réseau Livebox
router_name: Livebox 7
router_ip: 192.168.1.1
auto_velop_rdc: true
auto_velop_garage: true
grid_options:
  columns: full
  rows: auto
```

La carte peut aussi être ajoutée depuis le sélecteur de cartes de Home Assistant ; elle possède un **éditeur visuel**. Les valeurs `router_name` et `router_ip` servent à **l'affichage** et ne configurent pas l'accès réseau à la Livebox.

### Mise à jour depuis les versions précédentes

Conservez `custom:livebox-topologie-card` et le stockage existant. Après publication des nouveaux fichiers dans le dépôt, choisissez **Télécharger à nouveau** dans HACS, redémarrez **Home Assistant Core** si le Python a changé, puis rechargez votre navigateur. Le JavaScript chargé doit porter le paramètre `?v=0.5.0`.

**Ne supprimez pas** l'intégration Orange Livebox ni le fichier `.storage/livebox_reseau_map` : ce dernier conserve les corrections faites sur les appareils. Les anciens fichiers `/config/www/livebox-reseau-card.js` et l'ancienne carte `custom:livebox-reseau-card` ne sont pas nécessaires à cette version.

## Utilisation et diagnostic

Le badge **« Synchronisé HA »** confirme que le service de **stockage des personnalisations** répond. **Il ne confirme pas, à lui seul, que `TopologyDiagnostics` fonctionne.** Cette information est indiquée séparément sous la barre d'outils : **« Topologie Livebox : X nœuds analysés »**, ou un message d'erreur avec retour au classement par interfaces.

Ouvrez une branche ETH/Wi-Fi pour visualiser ses appareils, puis sélectionnez un appareil pour modifier son rattachement. Les changements sont enregistrés dans Home Assistant et partagés entre navigateurs et téléphones connectés. Seuls les **administrateurs Home Assistant** peuvent enregistrer ces corrections ; la lecture de la carte est accessible aux utilisateurs HA authentifiés autorisés à voir le dashboard.

Pour étudier une erreur de topologie, utilisez **« ⧉ Diagnostic » → « Copier »**. Les adresses IP et MAC sont omises, mais les **noms d'appareils restent visibles** : vérifiez le contenu avant de le publier. Le diagnostic n'est disponible que si la récupération de topologie a réussi.

## Stockage, sécurité et limitations techniques

- **Persistance :** `.storage/livebox_reseau_map`, géré par le stockage Home Assistant. Les modifications individuelles passent par les commandes WebSocket `livebox_reseau/get`, `set`, `subscribe` et `import`.
- **Topologie :** commande WebSocket `livebox_reseau/topology`, lecture via le compte Livebox de l'intégration Orange. Cache en mémoire de 900 secondes, perdu au redémarrage HA Core.
- **Données visibles dans le navigateur :** les noms, IP, MAC et interfaces des `device_tracker`, ainsi que les nœuds normalisés de topologie, sont accessibles au dashboard HA authentifié. Le bouton de diagnostic masque seulement IP et MAC **dans la copie produite**, pas dans les données utilisées pour dessiner la carte.
- **Pas de modification de la configuration Livebox :** le diagnostic demandé à l'API est distinct des opérations de configuration du routeur.
- **Dépendance à une API interne :** `TopologyDiagnostics` et l'objet `runtime_data.api` de l'intégration Orange sont susceptibles d'évoluer. Si l'appel n'est pas disponible, le mode de secours utilise les états HA et les groupes d'interfaces.
- **Installation du dépôt :** ce projet est une intégration Home Assistant accompagnée d'une carte Lovelace, **pas un add-on HAOS autonome**.

## Tests et état du projet

Des tests locaux vérifient la syntaxe et l'import de structures `Children` simulées, les règles de regroupement, les interactions de la carte et le stockage WebSocket simulé. Ils ne remplacent **pas** une validation sur une véritable Livebox 7, sur le système Home Assistant cible et sur plusieurs appareils.

```bash
python -m compileall -q custom_components/livebox_reseau
node --check custom_components/livebox_reseau/frontend/livebox-topologie-card.js
pytest -q tests/test_backend.py tests/test_topology.py
node tests/test_v04.cjs
node tests/test_topology_front.cjs
node tests/test_grid_options.cjs
```

**Statut : développement expérimental.** Ne pas présenter comme stable avant validation de la collecte réelle, de la qualité de la carte et des corrections de parenté (en particulier les Velop en mode pont et les CPL).

## Crédits

L'intégration **[Orange Livebox](https://github.com/cyr-ius/hass-livebox-component)** est un projet distinct, développé et maintenu par **cyr-ius**. Livebox Réseau s'appuie sur son fonctionnement, sans l'inclure ni en être une extension officielle. Orange et Livebox sont des marques de leurs détenteurs respectifs.

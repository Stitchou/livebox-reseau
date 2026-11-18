/* Livebox Réseau — Topologie groupée v0.7.0 (sans dépendance externe). */
const LIVEBOX_TOPO_VERSION='0.7.0';
function liveboxReadDevices(hass) {
  if (!hass || !hass.states) return [];
  return Object.values(hass.states)
    .filter((s) => {
      const a = s.attributes || {};
      return s.entity_id?.startsWith('device_tracker.') &&
        a.source_type === 'router' &&
        (typeof a.interface_name === 'string' || typeof a.connection === 'string');
    })
    .map((s) => {
      const a = s.attributes || {};
      const iface = String(a.interface_name || '').trim();
      const connection = String(a.connection || '').toLowerCase();
      const frequency = String(a.frequency_band || '').trim();
      const wifi = connection.includes('wifi') || /^(?:wl|vap)/i.test(iface);
      const ethernet = connection === 'ethernet' || /^eth\d+$/i.test(iface);
      const ip = String(a.ip || a.ip_address || '').trim();
      const mac = String(a.mac || '').trim().toUpperCase();
      const name = String(a.friendly_name || s.entity_id.replace(/^device_tracker\./, '')).trim();
      let groupKey;
      let groupLabel;
      let type;
      if (wifi) {
        const band = /2[.,]4|2\.4/.test(frequency) ? '2,4 GHz' :
          /5\s*(?:g|GHz)/i.test(frequency) ? '5 GHz' :
          /6\s*(?:g|GHz)/i.test(frequency) ? '6 GHz' : (frequency || 'bande inconnue');
        groupKey = `wifi:${band}:${iface || '?'}`;
        groupLabel = `Wi-Fi ${band}${iface ? ` · ${iface}` : ''}`;
        type = 'wifi';
      } else if (ethernet) {
        groupKey = `eth:${iface.toUpperCase() || '?'}`;
        groupLabel = `Ethernet · ${iface.toUpperCase() || 'interface inconnue'}`;
        type = 'ethernet';
      } else {
        groupKey = `other:${iface || '?'}`;
        groupLabel = iface ? `Autre interface · ${iface}` : 'Interface inconnue';
        type = 'other';
      }
      return {
        entityId: s.entity_id,
        name,
        ip,
        mac,
        iface,
        connection,
        frequency,
        groupKey,
        groupLabel,
        type,
        online: s.state === 'home',
        state: s.state,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
}

function liveboxMakeGroups(devices, filter, onlineOnly) {
  const search = String(filter || '').trim().toLocaleLowerCase('fr');
  const groups = new Map();
  devices.forEach((d) => {
    if (onlineOnly && !d.online) return;
    const haystack = [d.name, d.ip, d.mac, d.iface, d.connection, d.frequency]
      .join(' ').toLocaleLowerCase('fr');
    if (search && !haystack.includes(search)) return;
    if (!groups.has(d.groupKey)) groups.set(d.groupKey, {
      key: d.groupKey, label: d.groupLabel, type: d.type, devices: [],
    });
    groups.get(d.groupKey).devices.push(d);
  });
  const rank = { ethernet: 0, wifi: 1, other: 2 };
  return [...groups.values()].sort((a, b) =>
    (rank[a.type] - rank[b.type]) || a.label.localeCompare(b.label, 'fr', { numeric: true }));
}

// La personnalisation est indexée par entité HA (ou MAC) et ne change jamais les états HA.
function liveboxDeviceKey(d) { return d.mac ? 'mac:' + d.mac : d.entityId; }
function liveboxSort(a,b) { return a.name.localeCompare(b.name,'fr',{sensitivity:'base'}); }
// Reconciliation MAC avant tout. Une interface ETH seule n'est PAS un lien physique.
function liveboxCanonicalMac(value){const compact=String(value||'').replace(/[^a-fA-F0-9]/g,'').toUpperCase();return /^[0-9A-F]{12}$/.test(compact)?compact:'';}
function liveboxTopologyParents(devices,topology){
  if(!topology?.nodes?.length)return {links:new Map(),virtual:[],count:0};
  const records=topology.nodes;
  const nodes=new Map(records.map(n=>[n.id,n]));
  const byMac=new Map();
  for(const d of devices){
    const mac=liveboxCanonicalMac(d.mac);if(mac)byMac.set(mac,d);
  }
  const represented=new Map();
  for(const n of records){
    const d=byMac.get(liveboxCanonicalMac(n.mac)) || byMac.get(liveboxCanonicalMac(n.key));
    if(d)represented.set(n.id,d);
  }
  const assignedGroup=new Map();const childGroups=new Map();
  for(const [id,d] of represented){
    let cur=id;const seen=new Set();
    while(cur&&!seen.has(cur)){
      seen.add(cur);
      if(!childGroups.has(cur))childGroups.set(cur,new Set());
      childGroups.get(cur).add(d.groupKey);
      cur=nodes.get(cur)?.parent;
    }
  }
  const virtual=[];
  const virtualById=new Map();
  for(const n of records){
    if(represented.has(n.id) || !n.parent)continue; // Ne jamais doubler les devices HA / root Livebox
    const groups=childGroups.get(n.id);
    const isBridge=['switch','bridge','cpl','repeater'].includes(n.kind);
    if(!isBridge || groups?.size!==1)continue; // pas d'hub inventé !
    const groupKey=[...groups][0];
    const source=devices.find(d=>d.groupKey===groupKey);
    if(!source)continue;
    const synthetic={entityId:'topo:'+n.id,name:n.name||'Équipement intermédiaire',mac:n.mac||'',ip:'',iface:source.iface,
      groupKey,groupLabel:source.groupLabel,type:'other',connection:'',frequency:'',online:true,state:'home',source:'livebox',
      topologyRole:n.kind,topologyKey:n.id};
    virtual.push(synthetic);virtualById.set(n.id,synthetic);assignedGroup.set(n.id,groupKey);
  }
  const links=new Map();
  for(const [id,d] of represented){
    let parent=nodes.get(id)?.parent;const seen=new Set([id]);
    while(parent && !seen.has(parent)){
      seen.add(parent);
      const matched=represented.get(parent)||virtualById.get(parent);
      if(matched && matched.entityId!==d.entityId && matched.groupKey===d.groupKey){
        links.set(d.entityId,{parentId:matched.entityId,link:'other',source:'livebox'});break;
      }
      parent=nodes.get(parent)?.parent;
    }
  }
  for(const [id,d] of virtualById){
    let parent=nodes.get(id)?.parent;const seen=new Set([id]);
    while(parent && !seen.has(parent)){
      seen.add(parent);
      const matched=represented.get(parent)||virtualById.get(parent);
      if(matched && matched.entityId!==d.entityId && matched.groupKey===d.groupKey){
        links.set(d.entityId,{parentId:matched.entityId,link:'other',source:'livebox'});break;
      }
      parent=nodes.get(parent)?.parent;
    }
  }
  return {links,virtual,count:represented.size};
}
// Fusion purement visuelle : un adaptateur CPL Wi-Fi et son interface _2.4
// sont une seule boîte physique. La branche 2,4 GHz peut être la seule à
// posséder une adresse IP ; ses descendants Children ne sont jamais perdus.
function liveboxFuseCplWifi(groups) {
  const all=[];
  const walk=n=>{all.push(n);(n.children||[]).forEach(walk);};
  groups.forEach(g=>g.roots.forEach(walk));
  const norm=s=>String(s||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('fr');
  const suffix=/[_\s-]+2[.,]4(?:\s*ghz)?$/i;
  for(const secondary of [...all]) {
    if(!/\bcpl\b/i.test(secondary.name)||!suffix.test(secondary.name))continue;
    const baseName=norm((secondary.originalName||secondary.name).replace(suffix,''));
    const base=all.find(n=>n!==secondary && n.groupKey===secondary.groupKey && norm(n.originalName||n.name)===baseName);
    if(!base)continue;
    // Evite une fusion sur une structure circulaire ou incohérente.
    const ancestors=new Set();let cursor=base;
    while(cursor && !ancestors.has(cursor.entityId)){
      ancestors.add(cursor.entityId);
      cursor=all.find(n=>n.entityId===cursor.parentId);
    }
    if(ancestors.has(secondary.entityId))continue;
    const remove=list=>{const i=list.indexOf(secondary);if(i>=0){list.splice(i,1);return true;}return list.some(n=>remove(n.children||[]));};
    for(const group of groups)if(remove(group.roots))break;
    for(const child of secondary.children||[]){
      if(child.entityId===base.entityId)continue;
      child.parentId=base.entityId;
      if(!(base.children||[]).some(n=>n.entityId===child.entityId))base.children.push(child);
    }
    base.children.sort(liveboxSort);
    if(secondary.ip)base.ip=secondary.ip;
    base.online=base.online||secondary.online;
    base.cplWifi=true;
    base.mergedEntityIds=[...(base.mergedEntityIds||[base.entityId]),secondary.entityId];
    base.mergeNote='Interface Wi-Fi 2,4 GHz fusionnée (IP conservée)';
  }
  // La dénomination Spare1 est connue sur cette installation. Aucun autre
  // appareil n'est arbitrairement considéré comme point d'accès CPL.
  for(const node of all){
    if(/^cpl\s+spare1$/i.test(node.name) && !node.cplWifi)node.cplWifi=true;
  }
  return groups;
}

function liveboxTree(devices, overrides, autoVelop = true, topology = null, autoGarage = true) {
  const imported=liveboxTopologyParents(devices,topology);
  const allDevices=[...devices,...imported.virtual];
  const byId = new Map(allDevices.map(d=>[d.entityId,d]));
  const groupsAvailable = new Map(devices.map(d=>[d.groupKey,d.groupLabel]));
  const velop = devices.find(d=>/velop[ _-]*rdc/i.test(d.name) || /velop[ _-]*rdc/i.test(d.entityId));
  const garage = devices.find(d=>/velop[ _-]*garage/i.test(d.name) || /velop[ _-]*garage/i.test(d.entityId));
  const garageKnown = /^(?:titan(?:[ _-]*2)?|alexa bureau|cong[eé]lateur|pompe piscine)$/i;
  const nodes = allDevices.map(d=>{
    const o = overrides[liveboxDeviceKey(d)] || overrides[d.entityId] || {};
    const groupKey = groupsAvailable.has(o.group) ? o.group : d.groupKey;
    const importedParent=imported.links.get(d.entityId);
    // Configuration manuelle > règle confirmée Velop RDC > liens Children > interface ETH.
    const autoParentRdc = autoVelop && velop && !d.source && velop.groupKey==='eth:ETH2' && groupKey==='eth:ETH2' && velop.entityId!==d.entityId ? velop.entityId : null;
    const autoParentGarage = autoGarage && garage && !d.source && garage.groupKey===groupKey && garageKnown.test(d.name) && garage.entityId!==d.entityId ? garage.entityId : null;
    const autoParent=autoParentRdc || autoParentGarage;
    let parentId=autoParent || importedParent?.parentId || null;
    // Le faux switch déclaré par Orange autour d'un Velop ne représente pas un vrai parent.
    // Nous gardons le Velop directement sous son interface, puis ses clients confirmés.
    if ((d.entityId===velop?.entityId && autoVelop) || (d.entityId===garage?.entityId && autoGarage)) parentId=null;
    if (o.parent==='interface') parentId=null;
    else if (o.parent && o.parent!=='auto') parentId=byId.has(o.parent) && o.parent!==d.entityId ? o.parent : null;
    if(parentId && byId.get(parentId)?.groupKey!==groupKey)parentId=null;
    return {...d, originalName:d.name, name:o.name || d.name, groupKey, groupLabel:groupsAvailable.get(groupKey)||d.groupLabel,
      parentId, link:o.link && o.link!=='auto' ? o.link : autoParent && parentId===autoParent ? 'wifi' : importedParent?.link||d.type,
      edgeSource:(o.parent&&o.parent!=='auto')?'manual':autoParent&&parentId===autoParent?'rule':importedParent&&parentId===importedParent.parentId?'children':'interface',
      hidden:o.hidden===true, children:[]};
  });
  const map=new Map(nodes.map(d=>[d.entityId,d]));
  for (const n of nodes) {
    let cursor=n.parentId, seen=new Set([n.entityId]);
    while(cursor && !seen.has(cursor)){seen.add(cursor);cursor=map.get(cursor)?.parentId||null;}
    if(cursor) n.parentId=null; // Empêche les cycles de parenté.
  }
  for(const n of nodes) if(n.parentId) map.get(n.parentId)?.children.push(n);
  nodes.forEach(n=>n.children.sort(liveboxSort));
  const groups=new Map();
  for(const n of nodes.filter(d=>!d.parentId && !(d.source==='livebox' && d.children.length===0))) {
    if(!groups.has(n.groupKey)) groups.set(n.groupKey,{key:n.groupKey,label:n.groupLabel,type:n.type,roots:[]});
    groups.get(n.groupKey).roots.push(n);
  }
  const rank={ethernet:0,wifi:1,other:2};
  const result=[...groups.values()].map(g=>({...g,roots:g.roots.sort(liveboxSort)}))
    .sort((a,b)=>(rank[a.type]??3)-(rank[b.type]??3)||a.label.localeCompare(b.label,'fr',{numeric:true}));
  return liveboxFuseCplWifi(result);
}
function liveboxPrune(node,search,onlineOnly,showHidden=false) {
  const children=node.children.map(d=>liveboxPrune(d,search,onlineOnly,showHidden)).filter(Boolean);
  const own=(!onlineOnly||node.online) && (!search||[node.name,node.ip,node.mac,node.iface,node.connection].join(' ').toLowerCase().includes(search));
  return (showHidden || !node.hidden) && (own||children.length) ? {...node,children} : null;
}

const SVG_NS='http://www.w3.org/2000/svg';
function svgEl(tag,attrs={},txt){const e=document.createElementNS(SVG_NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));if(txt!==undefined)e.textContent=String(txt);return e;}
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const truncate=(s,n=23)=>String(s).length>n?String(s).slice(0,n-1)+'…':String(s);

class LiveboxTopologieCard extends HTMLElement {
  static getStubConfig(){return {title:'Mon réseau Livebox',router_name:'Livebox 7',router_ip:'192.168.1.1'};}
  static getConfigElement(){return document.createElement('livebox-topologie-card-editor');}
  // Home Assistant « Sections » : la carte occupe la largeur complète de sa section.
  // `rows: auto` laisse au graphe sa hauteur naturelle. Pas de restriction maximale
  // de colonnes : le bureau peut utiliser toute la largeur de la section.
  getGridOptions(){return {columns:'full',rows:'auto',min_columns:6};}
  getCardSize(){return 9;}
  setConfig(config){
    if(!config || (config.type && config.type!=='custom:livebox-topologie-card'))throw Error('Configuration invalide pour Livebox Topologie');
    this._config=config;
    if(!this.shadowRoot)this.attachShadow({mode:'open'});
    if(!this._ready)this._init();
    this._signature='';this._readData();this._connectBackend();
  }
  set hass(value){
    this._hass=value;
    if(!this._ready)return;
    this._connectBackend();
    if(!this._updateTimer)this._updateTimer=setTimeout(()=>{this._updateTimer=null;if(this.isConnected)this._readData();},200);
  }
  connectedCallback(){if(this._ready){this._resizeObserver?.observe(this);this._connectBackend();this._readData();}}
  disconnectedCallback(){
    this._resizeObserver?.disconnect();
    if(this._wireFrame!==null){cancelAnimationFrame(this._wireFrame);this._wireFrame=null;}
    if(this._updateTimer)clearTimeout(this._updateTimer);
    this._updateTimer=null;
    if(this._wsUnsub){this._wsUnsub();this._wsUnsub=null;}
    if(this._topologyTimer){clearInterval(this._topologyTimer);this._topologyTimer=null;}
    this._backendStatus='waiting';this._backendPromise=null;
  }
  _init(){
    this._ready=true;this._devices=[];this._overrides={};this._topology=null;this._topologyStatus='waiting';this._backendStatus='waiting';this._query='';
    this._showOnline=false;this._showHidden=false;this._expanded=null;this._focus=null;this._wireFrame=null;
    if(typeof ResizeObserver!=='undefined'){
      this._resizeObserver=new ResizeObserver(()=>this._queueWireLayout());
      if(this.isConnected)this._resizeObserver.observe(this);
    }
    this.shadowRoot.innerHTML=`
    <style>
      :host{display:block;min-width:0;color:var(--primary-text-color);font-family:var(--primary-font-family,inherit)}
      *{box-sizing:border-box}
      ha-card{display:block;padding:16px;min-width:0;border-radius:16px}
      button,input,select{font:inherit;color:inherit}button{cursor:pointer;touch-action:manipulation}
      button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}
      .head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}
      h2{font-size:19px;font-weight:700;letter-spacing:-.3px;margin:0}
      .sub,.tip{color:var(--secondary-text-color);font-size:12px;line-height:1.4}
      .sub{margin-top:3px}.tip{margin:0 0 10px}
      .badge{display:inline-flex;align-items:center;border:1px solid var(--divider-color);border-radius:8px;color:var(--secondary-text-color);padding:6px 8px;font-size:11px;white-space:nowrap}
      .badge.ok{color:var(--success-color,#2ab98f);border-color:var(--success-color,#2ab98f)}.badge.error{color:var(--error-color,#d45);border-color:var(--error-color,#d45)}
      .tools{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-bottom:10px}
      .btn{padding:8px 10px;min-height:35px;font-size:12px;border-radius:9px;border:1px solid var(--divider-color);background:var(--secondary-background-color)}
      .btn:hover,.branch-head:hover,.node-pill:hover{border-color:var(--primary-color)}
      #search{flex:1 1 180px;min-width:140px;max-width:350px;border:1px solid var(--divider-color);border-radius:9px;padding:9px 11px;font-size:12px;background:var(--secondary-background-color)}
      .toggle{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--secondary-text-color);white-space:nowrap}
      input[type=checkbox]{accent-color:var(--primary-color)}
      .sync-error{display:none;padding:9px;margin-bottom:10px;border:1px solid var(--error-color,#e55);border-radius:9px;font-size:12px;align-items:center;justify-content:space-between;gap:8px}
      .sync-error.visible{display:flex}
      :host{--lb-blue:#05bafa;--lb-green:#65db39;--lb-purple:#c85df5}
      .map{border:1px solid var(--divider-color);border-radius:15px;padding:18px 12px;min-height:180px;background:transparent;overflow:hidden}
      .network{display:grid;grid-template-columns:160px minmax(0,1fr);gap:15px;align-items:center;position:relative;isolation:isolate}
      .network-wires{position:absolute;inset:0;pointer-events:none;overflow:visible;z-index:0;display:block}
      .network-wires path{fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:2.3;vector-effect:non-scaling-stroke}
      .router-wrap,.branches{position:relative;z-index:1}
      .router-wrap{align-self:center;z-index:1}
      .router{padding:18px 12px;border:2px solid var(--lb-blue);border-radius:14px;background:color-mix(in srgb,var(--lb-blue) 9%,var(--card-background-color));width:100%;text-align:left;box-shadow:0 0 18px color-mix(in srgb,var(--lb-blue) 17%,transparent)}
      .router .title{font-size:15px;font-weight:700}.router .addr{font-size:11px;color:var(--secondary-text-color);margin-top:4px}
      .router .diamond{color:var(--lb-blue);font-size:21px;margin-right:7px}
      .branches{position:relative;border-left:0;padding-left:19px;min-width:0}
      .branch{position:relative;display:grid;grid-template-columns:174px minmax(0,1fr);gap:11px;align-items:center;margin:12px 0;min-width:0}
      .branch:before{display:none}
      .branch-head{display:flex;align-items:center;gap:8px;width:100%;border:1px solid var(--lb-blue);border-radius:12px;padding:8px 9px;min-height:50px;background:color-mix(in srgb,var(--lb-blue) 9%,var(--secondary-background-color));text-align:left;box-shadow:0 0 10px color-mix(in srgb,var(--lb-blue) 9%,transparent)}
      .branch-head .iface{font-size:19px;color:var(--lb-blue)}
      .branch-head .label{font-size:12px;font-weight:700}.branch-head .count{color:var(--secondary-text-color);font-size:10px;margin-top:2px}
      .branch-head .chevron{margin-left:auto;color:var(--secondary-text-color);font-size:14px}
      .branch-body{min-width:0;position:relative;padding-left:9px}
      .branch-body:before{display:none}
      .forest{display:flex;flex-direction:column;gap:9px;min-width:0}
      .direct-tiles,.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr));gap:6px;min-width:0}
      .direct-tiles{grid-template-columns:repeat(auto-fill,minmax(140px,1fr))}
      .node-pill{display:flex;align-items:center;gap:7px;min-width:0;min-height:42px;width:100%;padding:7px 8px;text-align:left;border-radius:10px;border:1px solid color-mix(in srgb,var(--primary-text-color) 25%,var(--divider-color));background:color-mix(in srgb,var(--secondary-background-color) 86%,var(--card-background-color));color:var(--primary-text-color);box-shadow:0 2px 9px rgba(0,0,0,.07)}
      .node-pill:hover{box-shadow:0 0 13px color-mix(in srgb,var(--primary-color) 20%,transparent)}
      .node-pill .ico{flex:0 0 19px;font-size:17px;color:var(--secondary-text-color);text-align:center}
      .node-pill .names{flex:1 1 auto;min-width:0}.node-pill .name{font-size:11px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}
      .node-pill .meta{font-size:10px;color:var(--secondary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;margin-top:3px}
      .node-pill .state{width:8px;height:8px;border-radius:100%;flex:0 0 8px;background:var(--secondary-text-color)}
      .node-pill .state.on{background:var(--success-color,#39cf64)}
      .node-cluster{display:grid;grid-template-columns:152px minmax(0,1fr);gap:10px;align-items:center;min-width:0;position:relative}
      .node-cluster>.cluster-main{position:relative;min-width:0;z-index:1}
      .node-cluster>.cluster-main:after{display:none}
      .node-cluster>.cluster-main .node-pill{border-color:var(--cluster-color);background:color-mix(in srgb,var(--cluster-color) 13%,var(--card-background-color));box-shadow:0 0 12px color-mix(in srgb,var(--cluster-color) 13%,transparent)}
      .node-cluster .cluster-main .ico{color:var(--cluster-color)}
      .node-cluster.wifi{--cluster-color:var(--lb-green)}
      .node-cluster.cpl{--cluster-color:var(--lb-purple)}
      .node-cluster.ethernet{--cluster-color:var(--lb-blue)}
      .node-cluster.cpl-master{--cluster-color:var(--lb-blue)}
      .node-cluster.cpl-master>.cluster-main:after{border-top:2px dashed var(--lb-purple)}
      .cluster-children{min-width:0;border:2px solid var(--cluster-color);border-radius:15px;background:color-mix(in srgb,var(--cluster-color) 5%,transparent);padding:8px 9px 10px}
      .cluster-children.cpl{border-color:var(--lb-purple)}
      .cluster-children.wifi{border-color:var(--lb-green)}
      .cluster-children.plain{border:0;background:transparent;padding:0}
      .cluster-label{font-size:12px;font-weight:700;color:var(--cluster-color);display:flex;align-items:center;gap:7px;margin-bottom:8px}
      .cluster-label .label-icon{font-size:16px}.cluster-label .cluster-count{font-weight:500;color:var(--secondary-text-color)}
      .cluster-children.cpl>.cluster-label{color:var(--lb-purple)}
      .cluster-children.wifi>.cluster-label{color:var(--lb-green)}
      .cluster-children.plain>.cluster-label{display:none}
      .nested-forest{display:flex;flex-direction:column;gap:8px}
      .legend{display:flex;gap:13px;flex-wrap:wrap;font-size:11px;color:var(--secondary-text-color);padding:10px 2px 0}
      .legend i{display:inline-block;width:14px;border-top:2px solid var(--lb-blue);vertical-align:middle;margin-right:4px}
      .legend i.wifi{border-top:2px dashed var(--lb-green)}.legend i.cpl{border-top:2px dashed var(--lb-purple)}.legend i.other{border-top:2px dotted var(--secondary-text-color)}
      .detail{display:none;padding:10px;margin-top:10px;border:1px solid var(--divider-color);border-radius:11px;background:var(--secondary-background-color);gap:12px;align-items:center;flex-wrap:wrap}
      .detail.visible{display:flex}.detail-info{flex:1;min-width:150px}.detail strong{display:block;font-size:14px}.detail small{color:var(--secondary-text-color);display:block;font-size:11px;margin-top:3px}.detail-actions{display:flex;gap:7px;flex-wrap:wrap}
      .overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:999;display:flex;align-items:center;justify-content:center;padding:12px}
      .dialog{background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:14px;padding:18px;width:min(100%,470px);max-height:85vh;overflow:auto;box-shadow:0 16px 55px rgba(0,0,0,.35)}
      .dialog h3{font-size:18px;margin:0 0 12px}.field{display:flex;flex-direction:column;gap:5px;margin:10px 0;font-size:12px}.field input,.field select{width:100%;border:1px solid var(--divider-color);background:var(--secondary-background-color);padding:9px 10px;border-radius:8px;font-size:13px;min-height:37px}
      .actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:16px}.primary{background:var(--primary-color);color:var(--text-primary-color,#fff);border-color:transparent}.warning{font-size:12px;color:var(--error-color,#e55);line-height:1.5}
      @media(max-width:1000px){.network{grid-template-columns:125px minmax(0,1fr)}.branch{grid-template-columns:140px minmax(0,1fr)}.node-cluster{grid-template-columns:130px minmax(0,1fr)}.direct-tiles,.tiles{grid-template-columns:repeat(auto-fill,minmax(120px,1fr))}}
      @media(max-width:650px){ha-card{padding:10px}.head{align-items:center}h2{font-size:17px}.tools{gap:5px}.btn{padding:7px 8px;font-size:11px}#search{max-width:none;flex:1 1 100%}
        .map{padding:10px}.network{display:block}.router-wrap{max-width:230px;margin:0 auto 15px}.branches{margin-left:12px;padding-left:13px}
        .branch{display:block;margin:11px 0}.branch:before{display:none}.branch-head{min-height:44px}.branch-body{margin-top:8px;padding-left:12px}.branch-body:before{display:none}
        .node-cluster{display:flex;flex-direction:column;align-items:stretch;gap:6px}.node-cluster>.cluster-main{max-width:230px}.node-cluster>.cluster-main:after{display:none}
        .direct-tiles,.tiles{grid-template-columns:repeat(auto-fill,minmax(min(100%,135px),1fr));gap:6px}.node-pill{min-height:42px;padding:6px}
        .cluster-children{padding:8px}.forest{gap:7px}
      }
    </style>
    <ha-card>
      <header class="head"><div><h2 id="title">Mon réseau Livebox</h2><div id="summary" class="sub"></div></div><span class="badge" id="sync">Connexion à HA…</span></header>
      <div class="sync-error" id="sync-error" role="status"><span id="sync-error-text">Enregistrement indisponible</span><button class="btn" id="retry-sync">Réessayer</button></div>
      <nav class="tools"><button class="btn" id="expand-all">⊞ Tout déployer</button><button class="btn" id="collapse-all">⊟ Tout replier</button><button class="btn" id="reload-topology" type="button">↻ Actualiser</button><button class="btn" id="copy-topology" type="button">⧉ Diagnostic</button><input type="search" id="search" placeholder="Rechercher un appareil, une IP…" aria-label="Rechercher"><label class="toggle"><input type="checkbox" id="online">En ligne</label><label class="toggle"><input type="checkbox" id="hidden">Masqués</label></nav>
      <p class="tip" id="topology-state">Topologie : connexion à la Livebox…</p>
      <div class="map" role="region" aria-label="Topologie Livebox"><div class="network"><svg id="network-wires" class="network-wires" aria-hidden="true" focusable="false"></svg><div class="router-wrap" id="router-wrap"></div><div class="branches" id="branches"></div></div></div>
      <div class="detail" id="detail"></div>
      <div class="legend"><span><i></i> Interface Livebox</span><span><i class="wifi"></i> Regroupement Wi-Fi</span><span><i class="cpl"></i> Groupe CPL</span><span><i class="other"></i> Lien à confirmer</span></div>
      <div id="modal-host"></div>
    </ha-card>`;
    const s=this.shadowRoot;
    s.getElementById('reload-topology').addEventListener('click',()=>this._fetchTopology());
    s.getElementById('copy-topology').addEventListener('click',()=>this._copyTopology());
    s.getElementById('retry-sync').addEventListener('click',()=>{this._backendStatus='waiting';this._backendPromise=null;this._connectBackend();});
    s.getElementById('search').addEventListener('input',e=>{this._query=e.target.value;this._paint();});
    s.getElementById('online').addEventListener('change',e=>{this._showOnline=e.target.checked;this._paint();});
    s.getElementById('hidden').addEventListener('change',e=>{this._showHidden=e.target.checked;this._paint();});
    s.getElementById('expand-all').addEventListener('click',()=>{this._expanded=new Set(this._getGroups().map(g=>g.key));this._paint();});
    s.getElementById('collapse-all').addEventListener('click',()=>{this._expanded=new Set();this._paint();});
  }
  _readData(){if(!this._hass)return;const list=liveboxReadDevices(this._hass);const sign=JSON.stringify(list);if(sign===this._signature)return;this._signature=sign;this._devices=list;this._paint();}
  _focusGroup(key){
    if(this._expanded===null)this._expanded=new Set();
    if(key)this._expanded.add(key);
    this._paint();
  }
  _showSync(){
    const e=this.shadowRoot?.getElementById('sync');if(!e)return;
    e.className='badge '+(this._backendStatus==='ready'?'ok':this._backendStatus==='error'?'error':'');
    e.textContent=this._backendStatus==='ready'?'● Synchronisé HA':this._backendStatus==='error'?'⚠ Stockage HA absent':'Connexion à HA…';
    if(this._backendError)e.title=this._backendError;
    const alert=this.shadowRoot.getElementById('sync-error'),msg=this.shadowRoot.getElementById('sync-error-text');
    if(alert&&msg){
      alert.classList.toggle('visible',this._backendStatus==='error');
      const problem=String(this._backendError||'');
      const missing=/unknown_command|not_found|unknown command|not found/i.test(problem);
      msg.textContent=missing?'Le composant Livebox Réseau n’est pas chargé. Installe-le via HACS, puis ajoute l’intégration dans Appareils et services.':'Stockage HA indisponible : '+(problem||'vérifie les journaux Home Assistant.');
    }
  }
  async _connectBackend(){
    if(!this._ready || !this.isConnected || !this._hass?.connection || this._backendPromise || this._backendStatus==='ready')return;
    this._backendStatus='connecting';this._showSync();const conn=this._hass.connection;
    this._backendPromise=(async()=>{
      const data=await conn.sendMessagePromise({type:'livebox_reseau/get'});
      if(!this.isConnected)return;
      this._overrides=data.overrides||{};this._backendStatus='ready';this._fetchTopology();
      if(!this._topologyTimer)this._topologyTimer=setInterval(()=>{if(this.isConnected)this._fetchTopology();},900000);this._backendError='';this._showSync();this._paint();
      const unsubscribe=await conn.subscribeMessage(data=>{this._overrides=data.overrides||{};this._paint();},{type:'livebox_reseau/subscribe'});
      if(this.isConnected)this._wsUnsub=unsubscribe;else unsubscribe();
    })().catch(err=>{this._backendStatus='error';this._backendError=String(err?.message||err);this._showSync();}).finally(()=>{this._backendPromise=null;});
  }
  async _fetchTopology(){
    if(this._topologyPromise || !this._hass?.connection || !this.isConnected)return;
    this._topologyStatus='loading';this._topologyError='';this._showTopologyState();
    this._topologyPromise=this._hass.connection.sendMessagePromise({type:'livebox_reseau/topology'})
      .then(data=>{if(!this.isConnected)return;this._topology=data;this._topologyStatus='ready';this._showTopologyState();this._paint();})
      .catch(error=>{this._topologyStatus='error';this._topologyError=String(error?.message||error);this._showTopologyState();})
      .finally(()=>{this._topologyPromise=null;});
    return this._topologyPromise;
  }
  _showTopologyState(){
    const el=this.shadowRoot?.getElementById('topology-state');if(!el)return;
    if(this._topologyStatus==='ready')el.textContent=`Topologie Livebox : ${this._topology?.count||0} nœuds analysés · liens issus de « Children » (intermédiaires à confirmer).`;
    else if(this._topologyStatus==='error')el.textContent='Topologie Livebox inaccessible : '+this._topologyError+' · Affichage de secours par interface.';
    else el.textContent='Analyse de la topologie Livebox…';
  }
  async _copyTopology(){
    if(!this._topology?.nodes?.length){
      const {dialog,close}=this._modal('Diagnostic Livebox');
      const p=document.createElement('p');p.textContent='Aucune topologie disponible. Utilise « ↻ Actualiser » puis réessaie.';
      dialog.appendChild(p);this._buttons(dialog,[['Fermer',close,false]]);return;
    }
    const idMap=new Map(this._topology.nodes.map((n,i)=>[n.id,'N'+(i+1)]));
    const report={version:LIVEBOX_TOPO_VERSION,source:'TopologyDiagnostics (anonymisé)',count:this._topology.count,
      nodes:this._topology.nodes.map(n=>({id:idMap.get(n.id),parent:idMap.get(n.parent)||null,
        name:n.name,kind:n.kind,children_count:n.children_count,tags:n.tags}))};
    const payload=JSON.stringify(report,null,2);
    const {dialog,close}=this._modal('Diagnostic de topologie');
    const info=document.createElement('p');info.className='sub';info.textContent='Identifiants, adresses IP et MAC supprimés. Les noms des appareils restent visibles.';
    const field=document.createElement('textarea');field.readOnly=true;field.value=payload;field.style.cssText='width:100%;min-height:250px;background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);border-radius:8px;font:11px monospace';
    dialog.append(info,field);
    this._buttons(dialog,[['Copier',async()=>{try{await navigator.clipboard.writeText(payload);info.textContent='Diagnostic copié.';}catch(_){field.select();info.textContent='Copie le texte sélectionné avec Ctrl+C.';}},true],['Fermer',close,false]]);
  }
  _getGroups(){return liveboxTree(this._devices,{...(this._config?.device_overrides||{}),...this._overrides},this._config?.auto_velop_rdc!==false,this._topology,this._config?.auto_velop_garage!==false);}

  _filterTree(){
    const q=this._query.trim().toLocaleLowerCase('fr');
    return this._getGroups().map(g=>({...g,roots:g.roots.map(d=>liveboxPrune(d,q,this._showOnline,this._showHidden)).filter(Boolean)})).filter(g=>g.roots.length);
  }
  _count(n){return 1+n.children.reduce((x,c)=>x+this._count(c),0);}
  _paint(){
    if(!this._ready)return;
    this._showSync();const s=this.shadowRoot,config=this._config||{};
    s.getElementById('title').textContent=config.title||'Mon réseau Livebox';
    const online=this._devices.filter(x=>x.online).length;
    s.getElementById('summary').textContent=`${this._devices.length} appareils · ${online} en ligne · ${this._devices.length-online} hors ligne`;
    const groups=this._filterTree();
    if(this._expanded===null && groups.length){
      // Sur PC, vue complète dès le départ. Sur mobile, sections réduites pour la lecture.
      this._expanded=new Set((this.clientWidth || window.innerWidth)>650?groups.map(g=>g.key):[]);
    }
    const r=s.getElementById('router-wrap');r.replaceChildren();
    const router=document.createElement('div');router.className='router';
    const name=document.createElement('div');name.className='title';name.textContent='◈  '+(config.router_name||'Livebox 7');
    const addr=document.createElement('div');addr.className='addr';addr.textContent=config.router_ip||'192.168.1.1';
    router.append(name,addr);r.appendChild(router);
    const branches=s.getElementById('branches');branches.replaceChildren();
    const forceExpand=!!this._query.trim();
    for(const group of groups){
      const expanded=(this._expanded?.has(group.key)||false)||forceExpand;
      const line=document.createElement('section');line.className='branch';line.dataset.group=group.key;
      const head=document.createElement('button');head.type='button';head.className='branch-head';head.setAttribute('aria-expanded',String(expanded));
      const ico=document.createElement('span');ico.className='iface';ico.textContent=group.type==='wifi'?'◉':'▦';
      const content=document.createElement('span');content.style.minWidth='0';
      const label=document.createElement('div');label.className='label';label.textContent=group.label;
      const count=document.createElement('div');count.className='count';
      const countRaw=this._devices.filter(d=>d.groupKey===group.key).length;
      count.textContent=`${countRaw} appareil${countRaw===1?'':'s'}`;
      content.append(label,count);
      const ch=document.createElement('span');ch.className='chevron';ch.textContent=expanded?'⌃':'⌄';
      head.append(ico,content,ch);
      head.addEventListener('click',()=>{if(this._expanded.has(group.key))this._expanded.delete(group.key);else this._expanded.add(group.key);this._paint();});
      line.appendChild(head);
      if(expanded){
        const body=document.createElement('div');body.className='branch-body';
        body.appendChild(this._renderForest(group.roots));line.appendChild(body);
      }
      branches.appendChild(line);
    }
    if(!groups.length){const msg=document.createElement('p');msg.className='tip';msg.textContent='Aucun appareil correspondant.';branches.appendChild(msg);}
    this._queueWireLayout();
  }
  // Les fils sont dessinés à partir de la position RÉELLE des éléments.
  // Cela empêche la ligne verticale de dépasser ETH0 / ETH4 lorsque les
  // sous-branches changent de taille et préserve les raccords arrondis.
  _queueWireLayout(){
    if(!this.isConnected || this._wireFrame!==null)return;
    this._wireFrame=requestAnimationFrame(()=>{
      this._wireFrame=null;
      if(this.isConnected)this._drawWires();
    });
  }
  _drawWires(){
    const network=this.shadowRoot?.querySelector('.network');
    const svg=this.shadowRoot?.getElementById('network-wires');
    const router=this.shadowRoot?.querySelector('.router');
    if(!network||!svg||!router)return;
    const frame=network.getBoundingClientRect();
    const width=network.clientWidth,height=network.clientHeight;
    svg.setAttribute('width',width);svg.setAttribute('height',height);
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    svg.replaceChildren();
    if(width<=0 || height<=0)return;
    const rect=el=>{const r=el.getBoundingClientRect();return {l:r.left-frame.left,r:r.right-frame.left,t:r.top-frame.top,b:r.bottom-frame.top,cx:(r.left+r.right)/2-frame.left,cy:(r.top+r.bottom)/2-frame.top};};
    const line=(path,color,dashed=false,kind='wire')=>{
      if(!path||/NaN|Infinity/.test(path))return;
      const p=svgEl('path',{d:path,stroke:color,'data-wire':kind});
      if(dashed)p.setAttribute('stroke-dasharray','5 5');
      svg.appendChild(p);
    };
    const blue='var(--lb-blue)',green='var(--lb-green)',purple='var(--lb-purple)';
    const mobile=getComputedStyle(network).display==='block';
    const heads=[...network.querySelectorAll('.branch-head')];
    if(!heads.length)return;
    const coords=heads.map(el=>rect(el));
    const routerPos=rect(router);
    const first=coords[0],last=coords.at(-1);
    const minY=first.cy,maxY=last.cy;
    const radius=Math.min(12,(maxY-minY)/2);
    if(mobile){
      // Sur téléphone : sortir sous la box avant de rejoindre les ETH.
      const x=Math.max(8,Math.min(...coords.map(c=>c.l))-16);
      const yStart=routerPos.b,yFirst=minY;
      const routeY=Math.min(yFirst-10,yStart+15);
      const sx=routerPos.cx;
      line(`M ${sx} ${yStart} C ${sx} ${routeY} ${x} ${routeY} ${x} ${yFirst}`,blue);
      if(maxY>minY)line(`M ${x} ${minY} V ${maxY}`,blue,false,'main-trunk');
      coords.forEach(c=>line(`M ${x} ${c.cy} Q ${x} ${c.cy-6} ${x+10} ${c.cy-6} Q ${x+16} ${c.cy-6} ${x+16} ${c.cy} L ${c.l} ${c.cy}`,blue));
    }else{
      const minHeadX=Math.min(...coords.map(c=>c.l));
      const x=Math.min(minHeadX-9,Math.max(routerPos.r+8, (routerPos.r+minHeadX)/2));
      const sy=clamp(routerPos.cy,minY,maxY);
      line(`M ${routerPos.r} ${routerPos.cy} C ${(routerPos.r+x)/2} ${routerPos.cy} ${(routerPos.r+x)/2} ${sy} ${x} ${sy}`,blue);
      if(coords.length===1){
        line(`M ${x} ${minY} H ${first.l}`,blue);
      }else{
        // Le tronc finit exactement sur le premier/dernier coude.
        line(`M ${x} ${minY+radius} V ${maxY-radius}`,blue,false,'main-trunk');
        coords.forEach((c,i)=>{
          if(i===0)line(`M ${x} ${minY+radius} Q ${x} ${minY} ${x+radius} ${minY} H ${c.l}`,blue);
          else if(i===coords.length-1)line(`M ${x} ${maxY-radius} Q ${x} ${maxY} ${x+radius} ${maxY} H ${c.l}`,blue);
          else line(`M ${x} ${c.cy-10} Q ${x} ${c.cy} ${x+10} ${c.cy} H ${c.l}`,blue);
        });
      }
    }
    // Un lien part de chaque port ETH vers CHAQUE enfant immédiat,
    // jamais entre deux appareils finaux d'une même grille.
    const smooth=(a,b,color,vertical=false)=>{
      if(vertical){
        const dy=Math.max(5,b.t-a.b);
        line(`M ${a.cx} ${a.b} C ${a.cx} ${a.b+dy*.45} ${b.cx} ${b.t-dy*.45} ${b.cx} ${b.t}`,color);
      }else{
        const dx=Math.max(4,b.l-a.r);
        line(`M ${a.r} ${a.cy} C ${a.r+dx*.48} ${a.cy} ${b.l-dx*.48} ${b.cy} ${b.l} ${b.cy}`,color);
      }
    };
    network.querySelectorAll('.branch').forEach(branch=>{
      const head=branch.querySelector(':scope > .branch-head');
      const body=branch.querySelector(':scope > .branch-body');
      if(!head||!body)return;
      const start=rect(head);
      const forest=body.querySelector(':scope > .forest');
      if(!forest)return;
      const direct=forest.querySelector(':scope > .direct-tiles > .node-pill');
      const parents=[...forest.querySelectorAll(':scope > .node-cluster > .cluster-main > .node-pill')];
      const targets=[direct,...parents].filter(Boolean).map(rect);
      if(mobile && targets.length){
        // La liaison mobile circule dans la gouttière GAUCHE, pas à travers
        // les cartes d'une sous-branche longue (ETH4 notamment).
        const x=Math.min(start.l+8,...targets.map(t=>t.l-8));
        const y0=start.b+4;
        const yLast=Math.max(...targets.map(t=>t.cy));
        line(`M ${start.l+10} ${start.b} Q ${x} ${start.b} ${x} ${y0}`,blue);
        if(yLast>y0)line(`M ${x} ${y0} V ${yLast}`,blue);
        targets.forEach(t=>line(`M ${x} ${t.cy-7} Q ${x} ${t.cy} ${x+7} ${t.cy} H ${t.l}`,blue));
      }else{
        targets.forEach(dest=>smooth(start,dest,blue));
      }
    });
    // Les groupements CPL et Wi-Fi possèdent chacun leur raccord courbe.
    network.querySelectorAll('.node-cluster').forEach(cluster=>{
      const pill=cluster.querySelector(':scope > .cluster-main > .node-pill');
      const group=cluster.querySelector(':scope > .cluster-children');
      if(!pill||!group)return;
      const a=rect(pill),b=rect(group);
      const color=cluster.classList.contains('cpl-master')||cluster.classList.contains('cpl')?purple:cluster.classList.contains('wifi')?green:blue;
      if(mobile)smooth(a,b,color,true);
      else smooth(a,b,color);
    });
  }
  _nodeMedium(d){
    if(d.cplWifi || d.link==='cpl'||d.topologyRole==='cpl'||/\bcpl\b/i.test(d.name))return 'cpl';
    if(d.link==='wifi'||d.type==='wifi'||/velop|point[\s-]*(?:d.acc[eè]s|wi[\s-]*fi)/i.test(d.name))return 'wifi';
    return 'ethernet';
  }
  _descendants(d){
    const result=[];const visit=n=>{for(const c of n.children||[]){result.push(c);visit(c);}};visit(d);
    return result;
  }
  _renderForest(nodes){
    const result=document.createElement('div');result.className='forest';
    const direct=nodes.filter(n=>!(n.children||[]).length);
    const parents=nodes.filter(n=>(n.children||[]).length);
    if(direct.length){
      const tiles=document.createElement('div');tiles.className='direct-tiles';
      direct.forEach(d=>tiles.appendChild(this._renderLeaf(d)));
      result.appendChild(tiles);
    }
    parents.forEach(d=>result.appendChild(this._renderNode(d)));
    return result;
  }
  _renderLeaf(d){
    const medium=this._nodeMedium(d);
    const btn=document.createElement('button');btn.type='button';btn.className='node-pill';btn.dataset.entity=d.entityId;
    btn.title=[d.name,d.ip,d.edgeSource==='children'?'Parent déclaré par la Livebox':d.edgeSource==='rule'?'Règle locale : à vérifier':d.edgeSource==='manual'?'Correction manuelle':'Interface déclarée'].filter(Boolean).join(' · ');
    const ico=document.createElement('span');ico.className='ico';
    ico.textContent=medium==='cpl'?'♧':medium==='wifi'?'◉':d.topologyRole==='switch'?'▦':'▣';
    const names=document.createElement('span');names.className='names';
    const title=document.createElement('span');title.className='name';title.textContent=d.name;
    const meta=document.createElement('span');meta.className='meta';
    meta.textContent=d.ip||((d.source==='livebox')?'Nœud Livebox':'IP inconnue');
    const state=document.createElement('span');state.className='state'+(d.online?' on':'');
    names.append(title,meta);btn.append(ico,names,state);
    btn.addEventListener('click',()=>this._select(d));
    return btn;
  }
  _renderNode(d){
    if(!(d.children||[]).length)return this._renderLeaf(d);
    const medium=this._nodeMedium(d);
    const isCplWifi=!!d.cplWifi;
    const isVelop=/\bvelop\b|point[\s-]*(?:d.acc[eè]s|wi[\s-]*fi)/i.test(d.name);
    const isCplMaster=medium==='cpl'&&!isCplWifi;
    const wrapper=document.createElement('div');
    wrapper.className='node-cluster '+medium+(isCplMaster?' cpl-master':'')+(isCplWifi?' cpl-wifi':'');
    wrapper.dataset.parent=d.entityId;
    const main=document.createElement('div');main.className='cluster-main';main.appendChild(this._renderLeaf(d));wrapper.appendChild(main);
    const children=document.createElement('section');children.className='cluster-children '+(isCplMaster?'plain':medium);
    const descendants=this._descendants(d);
    if(!isCplMaster){
      const label=document.createElement('div');label.className='cluster-label';
      const labelIcon=document.createElement('span');labelIcon.className='label-icon';labelIcon.textContent=isCplWifi?'♧':medium==='wifi'?'◉':'▦';
      const heading=document.createElement('span');
      heading.textContent=isCplWifi?'Réseau Wi-Fi CPL':isVelop?'Réseau Wi-Fi – '+d.name:medium==='wifi'?'Réseau Wi-Fi':medium==='cpl'?'Réseau CPL':'Équipements reliés';
      const count=document.createElement('span');count.className='cluster-count';count.textContent=`(${descendants.length} appareil${descendants.length===1?'':'s'})`;
      label.append(labelIcon,heading,count);children.appendChild(label);
    }
    if(isCplWifi || isVelop || medium==='wifi'){
      // Un groupe représente des clients du même parent, PAS une chaîne de
      // connexions successives entre les appareils.
      const tiles=document.createElement('div');tiles.className='tiles';
      for(const child of descendants)tiles.appendChild(this._renderLeaf(child));
      children.appendChild(tiles);
    }else{
      children.appendChild(this._renderForest(d.children));
    }
    wrapper.appendChild(children);
    return wrapper;
  }
  _select(device){
    this._selected=device;const el=this.shadowRoot.getElementById('detail');el.replaceChildren();el.classList.add('visible');
    const info=document.createElement('div');info.className='detail-info';const name=document.createElement('strong');name.textContent=device.name;
    const sub=document.createElement('small');sub.textContent=[device.ip,device.mac,device.link,device.online?'En ligne':'Hors ligne'].filter(Boolean).join(' · ');
    info.append(name,sub);const buttons=document.createElement('div');buttons.className='detail-actions';
    const more=document.createElement('button');more.className='btn';more.textContent='Fiche HA';more.addEventListener('click',()=>this.dispatchEvent(new CustomEvent('hass-more-info',{bubbles:true,composed:true,detail:{entityId:device.entityId}})));
    const edit=document.createElement('button');edit.className='btn';edit.textContent='⚙ Configurer';edit.addEventListener('click',()=>this._editDevice(device));
    const close=document.createElement('button');close.className='btn';close.textContent='✕';close.setAttribute('aria-label','Fermer la fiche');close.addEventListener('click',()=>el.classList.remove('visible'));
    buttons.append(more,edit,close);el.append(info,buttons);
  }
  _selectOptions(items,active){const s=document.createElement('select');for(const [key,label] of items){const opt=document.createElement('option');opt.value=key;opt.textContent=label;opt.selected=key===active;s.appendChild(opt);}return s;}
  _buttons(box,items){const line=document.createElement('div');line.className='actions';for(const [name,action,primary] of items){const btn=document.createElement('button');btn.className='btn'+(primary?' primary':'');btn.type='button';btn.textContent=name;btn.addEventListener('click',action);line.appendChild(btn);}box.appendChild(line);}
  _editDevice(d){
    const {dialog,close}=this._modal('Configurer · '+d.name);
    if(this._backendStatus!=='ready'){
      const p=document.createElement('p');p.className='warning';p.textContent='Le stockage partagé n’est pas chargé. Vérifie l’intégration Livebox Réseau dans Appareils et services.';dialog.appendChild(p);this._buttons(dialog,[['Fermer',close,false]]);return;
    }
    const key=liveboxDeviceKey(d),existing=this._overrides[key]||this._overrides[d.entityId]||{};
    const raw=this._devices.find(x=>x.entityId===d.entityId)||d;
    const name=document.createElement('input');name.maxLength=100;name.value=existing.name||raw.name;this._field(dialog,'Nom sur la carte',name);
    const groups=[...new Map(this._devices.map(x=>[x.groupKey,x.groupLabel])).entries()];
    const group=this._selectOptions([['auto','Automatique (Livebox)'],...groups],existing.group||'auto');this._field(dialog,'Interface / branche',group);
    const parents=[...this._devices,...liveboxTopologyParents(this._devices,this._topology).virtual].filter(x=>x.entityId!==d.entityId).map(x=>[x.entityId,x.name+' — '+(x.ip||'IP inconnue')]);
    const parent=this._selectOptions([['auto','Automatique (si confirmé)'],['interface','Directement sous la branche'],...parents],existing.parent||'auto');this._field(dialog,'Équipement parent',parent);
    const link=this._selectOptions([['auto','Automatique'],['wifi','Wi-Fi'],['ethernet','Ethernet'],['cpl','CPL'],['other','Non précisé']],existing.link||'auto');this._field(dialog,'Type de liaison',link);
    const hide=document.createElement('label');hide.className='toggle';const check=document.createElement('input');check.type='checkbox';check.checked=!!existing.hidden;hide.append(check,document.createTextNode(' Masquer cet appareil'));dialog.appendChild(hide);
    const note=document.createElement('p');note.className='sub';note.textContent='Sauvegardé dans Home Assistant : identique sur PC et téléphone.';dialog.appendChild(note);
    const submit=async props=>{try{const result=await this._hass.connection.sendMessagePromise({type:'livebox_reseau/set',key,props});this._overrides=result.overrides||{};close();this._paint();}catch(e){note.className='warning';note.textContent='Échec : '+String(e?.message||e);}};
    this._buttons(dialog,[['Réinitialiser',()=>submit({}),false],['Annuler',close,false],['Enregistrer',()=>{
      const props={};if(name.value.trim()&&name.value.trim()!==raw.name)props.name=name.value.trim();
      if(group.value!=='auto')props.group=group.value;
      if(parent.value!=='auto')props.parent=parent.value;
      if(link.value!=='auto')props.link=link.value;
      if(check.checked)props.hidden=true;
      if(props.parent&&props.parent!=='interface'){
        const nodes=this._getGroups().flatMap(g=>g.roots);let next=props.parent;const seen=new Set([d.entityId]);
        const rawDevices=this._devices;
        while(next){if(seen.has(next)){note.className='warning';note.textContent='Choisis un parent différent : la relation créerait une boucle.';return;}seen.add(next);const candidate=rawDevices.find(n=>n.entityId===next);const ov=candidate?this._overrides[liveboxDeviceKey(candidate)]:null;next=ov?.parent&&ov.parent!=='interface'&&ov.parent!=='auto'?ov.parent:null;}
      }
      submit(props);
    },true]]);
  }
}


// Editeur visuel Lovelace. Les réglages des équipements, eux, sont sauvegardés
// dans HAOS via WebSocket et non dans le YAML du dashboard.
class LiveboxTopologieCardEditor extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});}
  setConfig(config){this._config={...config};this._render();}
  set hass(value){this._hass=value;}
  _render(){
    if(!this._config)return;
    const s=this.shadowRoot;s.replaceChildren();
    const style=document.createElement('style');
    style.textContent=`:host{display:block;color:var(--primary-text-color)}
      .form{display:grid;gap:14px;padding:12px 2px}
      label{display:grid;gap:5px;font-size:14px}
      input[type=text]{width:100%;box-sizing:border-box;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color);padding:11px;color:var(--primary-text-color);font:inherit}
      .toggle{display:flex;align-items:center;gap:10px}
      .note{font-size:12px;color:var(--secondary-text-color);line-height:1.5}
      .state{font-size:12px;color:var(--secondary-text-color)}`;
    const form=document.createElement('div');form.className='form';
    const addField=(label,key,fallback)=>{
      const wrap=document.createElement('label'),caption=document.createElement('span'),inp=document.createElement('input');
      caption.textContent=label;inp.type='text';inp.value=this._config[key]??fallback;
      inp.addEventListener('change',()=>this._update(key,inp.value.trim()));
      wrap.append(caption,inp);form.appendChild(wrap);
    };
    addField('Titre de la carte','title','Mon réseau Livebox');
    addField('Nom du routeur','router_name','Livebox 7');
    addField('Adresse IP du routeur','router_ip','192.168.1.1');
    const row=document.createElement('label');row.className='toggle';
    const check=document.createElement('input');check.type='checkbox';check.checked=this._config.auto_velop_rdc!==false;
    check.addEventListener('change',()=>this._update('auto_velop_rdc',check.checked));
    const span=document.createElement('span');span.textContent='Regrouper automatiquement les appareils ETH2 sous Velop RDC';
    row.append(check,span);form.appendChild(row);
    const garageRow=document.createElement('label');garageRow.className='toggle';
    const garageCheck=document.createElement('input');garageCheck.type='checkbox';garageCheck.checked=this._config.auto_velop_garage!==false;
    garageCheck.addEventListener('change',()=>this._update('auto_velop_garage',garageCheck.checked));
    const garageLabel=document.createElement('span');garageLabel.textContent='Regrouper Titan 1/2, Alexa bureau, congélateur et pompe piscine sous Velop Garage (si même interface)';
    garageRow.append(garageCheck,garageLabel);form.appendChild(garageRow);
    const note=document.createElement('p');note.className='note';
    note.textContent='Pour attribuer un appareil à un autre parent, déploie sa branche et clique sur l’appareil → Configurer. Les réglages des appareils sont enregistrés dans Home Assistant et partagés avec le téléphone.';
    form.appendChild(note);
    s.append(style,form);
  }
  _update(key,value){
    if(!this._config)return;
    const next={...this._config,[key]:value};
    this._config=next;
    this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:next},bubbles:true,composed:true}));
  }
}
if(!customElements.get('livebox-topologie-card-editor'))customElements.define('livebox-topologie-card-editor',LiveboxTopologieCardEditor);

if(!customElements.get('livebox-topologie-card'))customElements.define('livebox-topologie-card',LiveboxTopologieCard);
window.customCards=window.customCards||[];
if(!window.customCards.some(c=>c.type==='livebox-topologie-card'))window.customCards.push({type:'livebox-topologie-card',name:'Livebox Réseau — carte graphique',description:'Topologie Livebox interactive avec réglages HA synchronisés',preview:true});

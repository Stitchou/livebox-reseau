/* Livebox Réseau — Topologie graphique v0.4.2 (sans dépendance externe). */
const LIVEBOX_TOPO_VERSION='0.4.2';
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
function liveboxTree(devices, overrides, autoVelop = true) {
  const byId = new Map(devices.map(d=>[d.entityId,d]));
  const groupsAvailable = new Map(devices.map(d=>[d.groupKey,d.groupLabel]));
  const velop = devices.find(d=>/velop[ _-]*rdc/i.test(d.name) || /velop[ _-]*rdc/i.test(d.entityId));
  const nodes = devices.map(d=>{
    const o = overrides[liveboxDeviceKey(d)] || overrides[d.entityId] || {};
    const groupKey = groupsAvailable.has(o.group) ? o.group : d.groupKey;
    const autoParent = autoVelop && velop && velop.groupKey==='eth:ETH2' && groupKey==='eth:ETH2' && velop.entityId!==d.entityId ? velop.entityId : null;
    let parentId = autoParent;
    if (o.parent==='interface') parentId=null;
    else if (o.parent && o.parent!=='auto') parentId=byId.has(o.parent) && o.parent!==d.entityId ? o.parent : null;
    return {...d, originalName:d.name, name:o.name || d.name, groupKey, groupLabel:groupsAvailable.get(groupKey)||d.groupLabel,
      parentId, link:o.link && o.link!=='auto' ? o.link : parentId===autoParent && autoParent ? 'wifi' : d.type,
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
  for(const n of nodes.filter(d=>!d.parentId)) {
    if(!groups.has(n.groupKey)) groups.set(n.groupKey,{key:n.groupKey,label:n.groupLabel,type:n.type,roots:[]});
    groups.get(n.groupKey).roots.push(n);
  }
  const rank={ethernet:0,wifi:1,other:2};
  return [...groups.values()].map(g=>({...g,roots:g.roots.sort(liveboxSort)}))
    .sort((a,b)=>(rank[a.type]??3)-(rank[b.type]??3)||a.label.localeCompare(b.label,'fr',{numeric:true}));
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
    if(this._updateTimer)clearTimeout(this._updateTimer);
    this._updateTimer=null;
    if(this._wsUnsub){this._wsUnsub();this._wsUnsub=null;}
    this._backendStatus='waiting';this._backendPromise=null;
  }
  _init(){
    this._ready=true;this._devices=[];this._overrides={};this._backendStatus='waiting';this._query='';
    this._showOnline=false;this._showHidden=false;this._focus=null;this._zoom=1;
    this._layout=null;this._view=null;this._pointer=new Map();this._moved=false;
    this.shadowRoot.innerHTML=`
    <style>
      :host{display:block;color:var(--primary-text-color);font-family:var(--primary-font-family,inherit);min-width:0}
      *{box-sizing:border-box}
      ha-card{display:block;min-width:0;padding:16px 16px 12px;overflow:hidden;border-radius:16px}
      .head{display:flex;align-items:flex-start;gap:8px;justify-content:space-between;flex-wrap:wrap;margin-bottom:12px}
      h2{font-size:19px;font-weight:700;margin:0;letter-spacing:-.4px}
      .sub{font-size:12px;color:var(--secondary-text-color);margin-top:3px}
      .badge{border:1px solid var(--divider-color);padding:5px 8px;font-size:11px;border-radius:8px;color:var(--secondary-text-color);white-space:nowrap}
      .badge.ok{border-color:#28816e;color:#3ebd95}.badge.error{border-color:var(--error-color,#f55);color:var(--error-color,#f55)}
      .tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
      button,input,select{font:inherit;color:inherit}
      button{cursor:pointer;touch-action:manipulation}
      button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}
      .btn{border:1px solid var(--divider-color);background:var(--secondary-background-color);border-radius:9px;padding:8px 11px;font-size:12px;min-height:34px}
      .btn:hover{border-color:var(--primary-color)}
      #search{border:1px solid var(--divider-color);background:var(--secondary-background-color);border-radius:9px;padding:9px 11px;font-size:12px;flex:1 1 160px;min-width:110px;max-width:390px}
      .toggle{font-size:12px;white-space:nowrap;display:flex;gap:5px;align-items:center;color:var(--secondary-text-color)}
      input[type=checkbox]{accent-color:var(--primary-color)}
      .viewport{position:relative;border-radius:14px;border:1px solid var(--divider-color);overflow:hidden;background-color:var(--secondary-background-color);background-image:radial-gradient(circle at center, var(--divider-color) .75px,transparent 1px);background-size:22px 22px;}
      svg#network{display:block;width:100%;height:clamp(440px,65vh,690px);touch-action:none;cursor:grab;user-select:none}
      svg#network.dragging{cursor:grabbing}
      .zoom{position:absolute;right:10px;bottom:11px;display:flex;gap:5px;z-index:1}
      .zoom .btn{padding:6px 9px;background:var(--card-background-color)}
      .legend{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 2px 0;color:var(--secondary-text-color);font-size:11px}
      .legend span{display:inline-flex;align-items:center;gap:5px}
      .swatch{display:inline-block;width:9px;height:9px;border-radius:50%;background:#25a884}.swatch.off{background:#80919e}
      .tip{font-size:11px;color:var(--secondary-text-color);margin:0 0 8px;line-height:1.35}
      .detail{padding:10px;margin-top:10px;display:none;border:1px solid var(--divider-color);border-radius:11px;background:var(--secondary-background-color)}
      .detail.visible{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
      .detail-info{flex:1;min-width:160px}.detail strong{display:block;font-size:14px}.detail small{color:var(--secondary-text-color);display:block;font-size:11px;margin-top:3px}
      .detail-actions{display:flex;gap:7px;flex-wrap:wrap}
      .empty{position:absolute;top:45%;text-align:center;width:100%;color:var(--secondary-text-color);font-size:14px;pointer-events:none}
      .overlay{position:fixed;inset:0;background:rgba(0,0,0,.68);z-index:999;display:flex;align-items:center;justify-content:center;padding:12px}
      .dialog{background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:14px;padding:18px;width:min(100%,470px);max-height:85vh;overflow:auto;box-shadow:0 16px 55px rgba(0,0,0,.35)}
      .dialog h3{font-size:18px;margin:0 0 12px}.field{display:flex;flex-direction:column;gap:5px;margin:10px 0;font-size:12px}.field input,.field select{width:100%;border:1px solid var(--divider-color);background:var(--secondary-background-color);padding:9px 10px;border-radius:8px;font-size:13px;min-height:37px}
      .actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:16px}.primary{background:var(--primary-color);color:var(--text-primary-color,#fff);border-color:transparent}
      .warning{font-size:12px;color:var(--error-color,#e55);line-height:1.5}
      .sync-error{display:none;padding:9px 11px;margin:0 0 10px;border:1px solid var(--error-color,#e55);border-radius:9px;color:var(--primary-text-color);background:var(--secondary-background-color);font-size:12px;line-height:1.5}
      .sync-error.visible{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
      @media(max-width:600px){ha-card{padding:12px} h2{font-size:17px}.sub{font-size:11px}.tools{gap:6px}.btn{padding:7px 8px}#search{flex-basis:100%;max-width:none}.toggle{font-size:11px}svg#network{height:clamp(425px,62vh,650px)}.legend{gap:8px;font-size:10px}}
    </style>
    <ha-card>
      <header class="head"><div><h2 id="title">Mon réseau Livebox</h2><div id="summary" class="sub"></div></div><span class="badge" id="sync">Connexion à HA…</span></header>
      <div class="sync-error" id="sync-error" role="status"><span id="sync-error-text">Enregistrement indisponible.</span><button class="btn" id="retry-sync" type="button">Réessayer</button></div>
      <nav class="tools"><button class="btn" id="back" hidden>← Réseau complet</button><input type="search" id="search" placeholder="Rechercher un appareil, une IP…" aria-label="Rechercher"><label class="toggle"><input type="checkbox" id="online">En ligne</label><label class="toggle"><input type="checkbox" id="hidden">Masqués</label></nav>
      <p class="tip" id="hint">Les branches ETHx représentent les interfaces déclarées par la Livebox. Aucun switch intermédiaire n'est deviné.</p>
      <div class="viewport"><svg id="network" role="img" aria-label="Topologie réseau interactive" xmlns="http://www.w3.org/2000/svg"></svg><div class="zoom"><button class="btn" id="minus" aria-label="Dézoomer">−</button><button class="btn" id="plus" aria-label="Zoomer">+</button><button class="btn" id="reset" aria-label="Recentrer">⤾</button></div><div class="empty" id="empty" hidden></div></div>
      <div class="detail" id="detail"></div>
      <div class="legend"><span><i class="swatch"></i>En ligne</span><span><i class="swatch off"></i>Hors ligne</span><span>Trait plein : lien configuré / interface déclarée</span><span>Branche ETHx ≠ câble direct</span></div>
      <div id="modal-host"></div>
    </ha-card>`;
    const s=this.shadowRoot;
    s.getElementById('retry-sync').addEventListener('click',()=>{this._backendStatus='waiting';this._backendPromise=null;this._connectBackend();});
    s.getElementById('search').addEventListener('input',e=>{this._query=e.target.value;this._paint();});
    s.getElementById('online').addEventListener('change',e=>{this._showOnline=e.target.checked;this._paint();});
    s.getElementById('hidden').addEventListener('change',e=>{this._showHidden=e.target.checked;this._paint();});
    s.getElementById('back').addEventListener('click',()=>this._focusGroup(null));
    s.getElementById('minus').addEventListener('click',()=>this._changeZoom(1/1.35));
    s.getElementById('plus').addEventListener('click',()=>this._changeZoom(1.35));
    s.getElementById('reset').addEventListener('click',()=>{this._zoom=1;this._resetView();});
    s.getElementById('network').addEventListener('pointerdown',e=>this._onDown(e));
    s.getElementById('network').addEventListener('pointermove',e=>this._onMove(e));
    s.getElementById('network').addEventListener('pointerup',e=>this._onUp(e));
    s.getElementById('network').addEventListener('pointercancel',e=>this._onUp(e));
    s.getElementById('network').addEventListener('wheel',e=>{if(e.ctrlKey){e.preventDefault();this._changeZoom(e.deltaY<0?1.2:1/1.2);}}, {passive:false});
    if(typeof ResizeObserver!=='undefined')this._resizeObserver=new ResizeObserver(()=>{
      const compact=this.clientWidth<600;
      if(compact!==this._mobile){this._mobile=compact;this._paint();}
    });
  }
  _readData(){if(!this._hass)return;const list=liveboxReadDevices(this._hass);const sign=JSON.stringify(list);if(sign===this._signature)return;this._signature=sign;this._devices=list;this._paint();}
  _focusGroup(key){this._focus=key;this._zoom=1;this._selected=null;this.shadowRoot.getElementById('detail').classList.remove('visible');this._paint();}
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
      this._overrides=data.overrides||{};this._backendStatus='ready';this._backendError='';this._showSync();this._paint();
      const unsubscribe=await conn.subscribeMessage(data=>{this._overrides=data.overrides||{};this._paint();},{type:'livebox_reseau/subscribe'});
      if(this.isConnected)this._wsUnsub=unsubscribe;else unsubscribe();
    })().catch(err=>{this._backendStatus='error';this._backendError=String(err?.message||err);this._showSync();}).finally(()=>{this._backendPromise=null;});
  }
  _getGroups(){return liveboxTree(this._devices,{...(this._config?.device_overrides||{}),...this._overrides},this._config?.auto_velop_rdc!==false);}
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
    s.getElementById('back').hidden=!this._focus;
    const groups=this._filterTree();
    const g=this._focus?groups.find(x=>x.key===this._focus):null;
    if(this._focus&&!this._getGroups().some(x=>x.key===this._focus))this._focus=null;
    this._mobile=this.clientWidth>0?this.clientWidth<600:!!this._mobile;
    const scene=this._focus?(g?this._sceneDetail(g):this._sceneEmpty()):this._sceneOverview(groups);
    const svg=s.getElementById('network');svg.replaceChildren();
    const edges=svgEl('g',{class:'edges'}),nodes=svgEl('g',{class:'nodes'});svg.append(edges,nodes);
    for(const e of scene.edges)this._edge(edges,e);
    for(const n of scene.nodes)this._drawNode(nodes,n);
    this._layout={width:scene.width,height:scene.height};this._resetView();
    const empty=s.getElementById('empty');empty.hidden=scene.nodes.length>0;empty.textContent='Aucun équipement correspondant';
    s.getElementById('hint').textContent=this._focus?`Branche ${g?.label||''} · Fais glisser le graphe pour explorer ; utilise + / − pour zoomer.`:'Clique sur une branche pour afficher ses appareils. Zoome et déplace la carte si nécessaire.';
  }
  _sceneEmpty(){return {width:600,height:450,nodes:[],edges:[]};}
  _sceneOverview(groups){
    const mobile=this._mobile;
    if(mobile){
      const W=520,row=104,H=Math.max(530,225+Math.ceil(groups.length/2)*row),nodes=[{kind:'router',name:this._config?.router_name||'Livebox 7',subtitle:this._config?.router_ip||'192.168.1.1',x:260,y:72,w:224,h:80}];const edges=[];
      groups.forEach((g,i)=>{
        const x=140+(i%2)*240, y=226+Math.floor(i/2)*row;
        nodes.push({kind:'group',id:g.key,name:g.label,subtitle:`${g.roots.reduce((n,d)=>n+this._count(d),0)} appareils`,x,y,w:213,h:72,online:true});
        edges.push({x1:260,y1:113,x2:x,y2:y-37,color:'#4a91b5'});
      });return {width:W,height:H,nodes,edges};
    }
    const W=1320,H=790,cx=660,cy=398,rx=380,ry=268;
    const nodes=[{kind:'router',name:this._config?.router_name||'Livebox 7',subtitle:this._config?.router_ip||'192.168.1.1',x:cx,y:cy,w:240,h:96}],edges=[];
    groups.forEach((g,i)=>{const a=-Math.PI/2+2*Math.PI*i/Math.max(groups.length,1),x=cx+rx*Math.cos(a),y=cy+ry*Math.sin(a);
      nodes.push({kind:'group',id:g.key,name:g.label,subtitle:`${g.roots.reduce((n,d)=>n+this._count(d),0)} appareils`,x,y,w:220,h:82,online:true});
      edges.push({x1:cx,y1:cy,x2:x,y2:y,color:'#4a91b5'});
    });return {width:W,height:H,nodes,edges};
  }
  _sceneDetail(group){
    const mobile=this._mobile;
    const roots=group.roots;
    const parentNodes=roots.filter(n=>n.children.length);
    const plainRoots=roots.filter(n=>!n.children.length);
    const descendants=[];
    const add=(node,parent)=>{descendants.push({node,parent});node.children.forEach(c=>add(c,node.entityId));};
    for(const parent of parentNodes)parent.children.forEach(c=>add(c,parent.entityId));
    for(const leaf of plainRoots)descendants.push({node:leaf,parent:null});
    const cols=mobile?2:3,stepX=mobile?242:227,stepY=mobile?77:80;
    const top=mobile?295:120;
    const numRows=Math.ceil(Math.max(1,descendants.length)/cols);
    const H=Math.max(mobile?650:670,top+numRows*stepY+120);
    const W=mobile?520:1730,center=mobile?130:H/2;
    const router={kind:'router',name:this._config?.router_name||'Livebox 7',subtitle:this._config?.router_ip||'192.168.1.1',x:mobile?128:150,y:mobile?65:center,w:mobile?190:226,h:mobile?70:86};
    const iface={kind:'interface',name:group.label,subtitle:`${roots.reduce((n,d)=>n+this._count(d),0)} équipements`,x:mobile?372:435,y:mobile?65:center,w:mobile?235:212,h:mobile?70:78};
    const nodes=[router,iface],edges=[{x1:router.x,y1:router.y,x2:iface.x,y2:iface.y,color:'#4a91b5'}];
    const positions=new Map();
    descendants.forEach(({node},i)=>{const x=(mobile?140:950)+(i%cols)*stepX,y=top+Math.floor(i/cols)*stepY;
      const n={kind:'device',id:node.entityId,data:node,name:node.name,subtitle:node.ip||'IP inconnue',x,y,w:mobile?218:204,h:61,online:node.online};
      positions.set(node.entityId,n);nodes.push(n);
    });
    parentNodes.forEach((parent,i)=>{
      const linked=descendants.filter(v=>v.parent===parent.entityId).map(v=>positions.get(v.node.entityId)).filter(Boolean);
      const average=linked.length?linked.reduce((v,n)=>v+n.y,0)/linked.length:center;
      const x=mobile?260:690,y=mobile?204:average;
      const n={kind:'device',id:parent.entityId,data:parent,name:parent.name,subtitle:parent.ip||'Point d’accès',x,y,w:mobile?206:208,h:66,online:parent.online};
      positions.set(parent.entityId,n);nodes.push(n);edges.push({x1:iface.x,y1:iface.y,x2:x,y2:y,color:'#4a91b5'});
    });
    for(const {node,parent} of descendants){
      const dest=positions.get(node.entityId);
      const src=parent?positions.get(parent):iface;
      if(dest&&src){edges.push({x1:src.x,y1:src.y,x2:dest.x,y2:dest.y,color:node.online?'#42a7a1':'#86939c',dash:node.link==='wifi'});}
    }
    return {width:W,height:H,nodes,edges};
  }
  _edge(target,e){
    const dx=e.x2-e.x1,dy=e.y2-e.y1;
    const path=svgEl('path',{d:`M${e.x1} ${e.y1} C${e.x1+dx*.42} ${e.y1},${e.x2-dx*.40} ${e.y2},${e.x2} ${e.y2}`,fill:'none',stroke:e.color||'#6b8391','stroke-width':2.2,'stroke-opacity':0.75});
    if(e.dash)path.setAttribute('stroke-dasharray','7 6');target.appendChild(path);
  }
  _drawNode(target,n){
    const g=svgEl('g',{transform:`translate(${n.x-n.w/2} ${n.y-n.h/2})`,style:'cursor:pointer'});
    const isRouter=n.kind==='router',isGroup=n.kind==='group',isIface=n.kind==='interface';
    const stroke=isRouter?'#33b3df':isGroup||isIface?'#558ba4':n.online?'#2e997f':'#768691';
    const bg=isRouter?'#143c50':isGroup||isIface?'#193341':'#1c2934';
    g.appendChild(svgEl('rect',{x:0,y:0,width:n.w,height:n.h,rx:isRouter?17:12,fill:bg,stroke,'stroke-width':isRouter?2.5:1.4}));
    const icon=isRouter?'◈':isGroup||isIface?(/^wifi:/i.test(n.id||'')?'◎':'▦'):(n.data?.link==='wifi'||n.data?.type==='wifi'?'◉':'▣');
    g.appendChild(svgEl('text',{x:18,y:n.h/2+7,'font-size':isRouter?26:22,fill:stroke,'font-weight':700},icon));
    g.appendChild(svgEl('text',{x:51,y:n.h/2-5,'font-size':isRouter?17:14,'font-weight':700,fill:'#f5fafc'},truncate(n.name,isRouter?19:21)));
    g.appendChild(svgEl('text',{x:51,y:n.h/2+15,'font-size':12,fill:'#b5c7d0'},truncate(n.subtitle,28)));
    if(n.kind==='device'){g.appendChild(svgEl('circle',{cx:n.w-13,cy:13,r:5.5,fill:n.online?'#25b993':'#91a2ac'}));}
    if(n.kind==='group'){
      g.addEventListener('click',()=>{if(!this._moved)this._focusGroup(n.id);});
      g.appendChild(svgEl('title',{},'Ouvrir cette branche'));
    }else if(n.kind==='device'){
      g.addEventListener('click',()=>{if(!this._moved)this._select(n.data);});
      g.appendChild(svgEl('title',{},`${n.name} · ${n.subtitle} — toucher pour configurer`));
    }else if(n.kind==='interface'){
      g.addEventListener('click',()=>{if(!this._moved)this._focusGroup(null);});
    }
    target.appendChild(g);
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
  _resetView(){
    if(!this._layout)return;
    const W=this._layout.width,H=this._layout.height;
    const vh=this._mobile&&this._focus?Math.min(645,H):H;
    const width=W/this._zoom,height=vh/this._zoom;
    this._view={x:0,y:0,w:width,h:height};this._applyView();
  }
  _applyView(){if(this._view)this.shadowRoot.getElementById('network').setAttribute('viewBox',`${this._view.x} ${this._view.y} ${this._view.w} ${this._view.h}`);}
  _changeZoom(factor){if(!this._layout||!this._view)return;const oldZoom=this._zoom;this._zoom=clamp(oldZoom*factor,1,5);const view=this._view,ratio=oldZoom/this._zoom;
    const w=view.w*ratio,h=view.h*ratio;view.x=clamp(view.x+(view.w-w)/2,0,Math.max(0,this._layout.width-w));view.y=clamp(view.y+(view.h-h)/2,0,Math.max(0,this._layout.height-h));view.w=w;view.h=h;this._applyView();}
  _onDown(e){if(e.button!==0)return;const svg=this.shadowRoot.getElementById('network');this._pointer.set(e.pointerId,{x:e.clientX,y:e.clientY});this._moved=false;svg.classList.add('dragging');svg.setPointerCapture(e.pointerId);}
  _onMove(e){if(!this._pointer.has(e.pointerId)||!this._view||!this._layout)return;const prev=this._pointer.get(e.pointerId);const deltaX=e.clientX-prev.x,deltaY=e.clientY-prev.y;
    if(Math.abs(deltaX)+Math.abs(deltaY)>3)this._moved=true;
    this._pointer.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const svg=this.shadowRoot.getElementById('network');const box=svg.getBoundingClientRect();
    if(!box.width||!box.height)return;
    const v=this._view;
    v.x=clamp(v.x-deltaX*v.w/box.width,0,Math.max(0,this._layout.width-v.w));
    v.y=clamp(v.y-deltaY*v.h/box.height,0,Math.max(0,this._layout.height-v.h));this._applyView();
  }
  _onUp(e){this._pointer.delete(e.pointerId);this.shadowRoot.getElementById('network').classList.remove('dragging');if(this._moved){const moved=true;queueMicrotask(()=>{if(moved)this._moved=false;});}}
  _modal(title){const host=this.shadowRoot.getElementById('modal-host');host.replaceChildren();const layer=document.createElement('div');layer.className='overlay';const dialog=document.createElement('div');dialog.className='dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');const h=document.createElement('h3');h.textContent=title;dialog.appendChild(h);layer.appendChild(dialog);host.appendChild(layer);const close=()=>host.replaceChildren();layer.addEventListener('click',e=>{if(e.target===layer)close();});return {dialog,close};}
  _field(box,label,control){const wrap=document.createElement('label');wrap.className='field';const span=document.createElement('span');span.textContent=label;wrap.append(span,control);box.appendChild(wrap);}
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
    const parents=this._devices.filter(x=>x.entityId!==d.entityId).map(x=>[x.entityId,x.name+' — '+(x.ip||'IP inconnue')]);
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

if(!customElements.get('livebox-topologie-card'))customElements.define('livebox-topologie-card',LiveboxTopologieCard);
window.customCards=window.customCards||[];
if(!window.customCards.some(c=>c.type==='livebox-topologie-card'))window.customCards.push({type:'livebox-topologie-card',name:'Livebox Réseau — carte graphique',description:'Topologie Livebox interactive avec réglages HA synchronisés',preview:true});

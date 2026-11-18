const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync(__dirname+'/../custom_components/livebox_reseau/frontend/livebox-topologie-card.js','utf8');
const registered=new Map(),ctx={window:{customCards:[]},customElements:{get:k=>registered.get(k),define:(k,v)=>registered.set(k,v)},HTMLElement:class{},console,setTimeout,clearTimeout};
vm.createContext(ctx);vm.runInContext(src,ctx);
const tree=vm.runInContext('liveboxTree',ctx);
function d(id,name,iface,ip){return {entityId:'device_tracker.test'+id,name,ip,mac:'02:00:00:00:00:'+id.toString(16).padStart(2,'0'),iface,groupKey:'eth:'+iface,groupLabel:'Ethernet · '+iface,type:'ethernet',online:true,connection:'ethernet'};}
const devices=[d(1,'Velop RDC','ETH2','192.0.2.12'),d(2,'Client A','ETH2','192.0.2.16'),d(3,'Client B','ETH2','192.0.2.17'),d(4,'CPL Master','ETH4',''),d(5,'CPL Spare1','ETH4',''),d(6,'CPL Spare1_2.4','ETH4','192.0.2.39'),d(7,'Capteur A','ETH4','192.0.2.20'),d(8,'Prise B','ETH4','192.0.2.21'),d(9,'Velop Garage','ETH4','192.0.2.38'),d(10,'Titan','ETH4','192.0.2.54')];
// Contrôle important : la Livebox place Spare1 au même niveau que Master,
// et les clients ETH2 hors du Velop. Les deux règles locales doivent corriger cela.
const topo={nodes:[{id:'root',parent:null,kind:'router'},...devices.map(x=>({id:x.entityId,parent:'root',kind:'device',mac:x.mac,name:x.name}))]};
function flatten(gs){const out=[];function walk(n){out.push(n);for(const c of n.children||[])walk(c);}for(const g of gs)for(const r of g.roots)walk(r);return out;}
const branches=tree(devices,{},true,topo,true), all=flatten(branches);
const master=all.find(n=>n.name==='CPL Master');
const spare=all.find(n=>n.name==='CPL Spare1');
const rdc=all.find(n=>n.name==='Velop RDC');
const garage=all.find(n=>n.name==='Velop Garage');
assert(master&&spare&&rdc&&garage);
assert.equal(spare.parentId,master.entityId,'Spare1 doit dépendre de Master');
assert.equal(spare.link,'cpl','lien Master → Spare1 violet');
assert.equal(spare.edgeSource,'rule','relation explicitement confirmée');
assert.equal(spare.ip,'192.0.2.39','Spare1 hérite de la seule IP de Spare1_2.4');
assert.equal(spare.cplWifi,true,'Spare1 est le CPL Wi-Fi');
assert.equal(spare.mergedEntityIds.length,2,'Spare1 et 2,4 GHz forment une seule bulle');
assert(!all.some(n=>n.name==='CPL Spare1_2.4'));
assert.equal(rdc.children.length,2,'tous les autres appareils ETH2 sous Velop RDC');
assert(rdc.children.every(n=>n.link==='wifi'));
assert.equal(garage.children.length,1,'regroupement Velop garage conservé');
// Précédentes corrections manuelles explicitement choisies prioritaires.
const ov={['mac:'+devices[4].mac]:{parent:'interface'}};
const manual=flatten(tree(devices,ov,true,topo,true)).find(n=>n.name==='CPL Spare1');
assert.equal(manual.parentId,null,'une exception manuelle doit rester possible');
const wrongBranch=[...devices.slice(0,5),{...devices[5],groupKey:'eth:ETH3',groupLabel:'Ethernet · ETH3'},...devices.slice(6)];
const unmerged=flatten(tree(wrongBranch,{},true,topo,true));
assert(unmerged.some(n=>n.name==='CPL Spare1_2.4'),'ne pas fusionner entre branches différentes');
const split=[...devices.slice(0,4),{...devices[4],groupKey:'eth:ETH3',groupLabel:'Ethernet · ETH3'},...devices.slice(5)];
const apart=flatten(tree(split,{},true,topo,true));
assert.equal(apart.find(n=>n.name==='CPL Spare1').parentId,null,'ne pas relier Spare1 à un Master sur un autre port');
assert.equal(branches.find(g=>g.key==='eth:ETH4').roots.some(n=>n.name==='CPL Master'),true);
console.log('V072_RELATIONSHIPS_OK: 14 assertions; ETH2 Velop, ETH4 Master→Spare1, IP 2.4, no duplicates, manual override, branch isolation');

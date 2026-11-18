const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync(__dirname+'/../custom_components/livebox_reseau/frontend/livebox-topologie-card.js','utf8');
const registry=new Map();const ctx={window:{customCards:[]},customElements:{get:k=>registry.get(k),define:(k,v)=>registry.set(k,v)},HTMLElement:class{},console,setTimeout,clearTimeout};
vm.createContext(ctx);vm.runInContext(src,ctx);
const tree=vm.runInContext('liveboxTree',ctx);
function dev(name,port,ip,id){return {entityId:'device_tracker.test_'+id,name,originalName:name,mac:'02:00:00:00:00:'+id.toString(16).padStart(2,'0'),ip,groupKey:'eth:ETH'+port,groupLabel:'Ethernet · ETH'+port,type:'ethernet',online:true,connection:'ethernet',iface:'ETH'+port};}
const items=[dev('CPL principal',4,'',1),dev('CPL Wi-Fi',4,'',2),dev('CPL Wi-Fi_2.4',4,'192.0.2.50',3),dev('Prise connectée A',4,'192.0.2.51',4),dev('Capteur B',4,'192.0.2.52',5),dev('Point Wi-Fi RDC',2,'192.0.2.53',6),dev('Téléphone A',2,'192.0.2.54',7)];
const nodes=[{id:'r',parent:null,kind:'router'},...items.map((d,i)=>({id:'t'+(i+1),mac:d.mac,parent:i===1?'t1':i===2?'t2':i===3||i===4?'t3':i===6?'t6':'r',kind:i<3?'cpl':'device',name:d.name}))];
const topo={nodes};
function collect(g){const arr=[];const f=n=>{arr.push(n);n.children.forEach(f);};g.forEach(x=>x.roots.forEach(f));return arr;}
const groups=tree(items,{},false,topo,false);const all=collect(groups);
const cpl=all.find(n=>n.name==='CPL Wi-Fi');
assert(cpl);assert.equal(cpl.ip,'192.0.2.50');assert.equal(cpl.cplWifi,true);
assert.equal(cpl.mergedEntityIds.length,2);assert.equal(cpl.children.length,2);
assert(!all.some(n=>n.name==='CPL Wi-Fi_2.4'));assert.equal(all.length,items.length-1);
assert.equal(cpl.parentId,'device_tracker.test_1');
const overrides={['mac:'+items[1].mac]:{name:'CPL personnalisé'}};
const renamed=collect(tree(items,overrides,false,topo,false));
assert.equal(renamed.find(n=>n.name==='CPL personnalisé').ip,'192.0.2.50');
const changedPort=[...items.slice(0,2),{...items[2],groupKey:'eth:ETH2',groupLabel:'Ethernet · ETH2'},...items.slice(3)];
assert.equal(collect(tree(changedPort,{},false,topo,false)).filter(n=>n.name.startsWith('CPL Wi-Fi')).length,2);
const single=tree(items,{},false,topo,false).find(g=>g.key==='eth:ETH4');assert(single?.roots.length===1);
console.log('V07_LOGIC_OK: 11 assertions, IP retained, unique CPL node, overrides, branch isolation');

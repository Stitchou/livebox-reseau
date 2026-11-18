const fs=require('fs'), vm=require('vm'),assert=require('node:assert/strict');
const src=fs.readFileSync(__dirname+'/../custom_components/livebox_reseau/frontend/livebox-topologie-card.js','utf8');
const registry=new Map(), ctx={window:{customCards:[]},customElements:{get:k=>registry.get(k),define:(k,v)=>registry.set(k,v)},HTMLElement:class{},console,setTimeout,clearTimeout};
vm.createContext(ctx);vm.runInContext(src,ctx);
const tree=vm.runInContext('liveboxTree',ctx);
const mac=x=>x.toUpperCase();
const dev=(name,ip,iface,macAddr)=>({entityId:'device_tracker.'+name.toLowerCase().replaceAll(' ','_'),name,ip,mac:mac(macAddr),groupKey:'eth:'+iface,groupLabel:'Ethernet · '+iface,iface,connection:'ethernet',type:'ethernet',online:true});
const devices=[dev('HA','192.168.1.64','ETH1','48:0F:CF:57:8E:2C'),dev('Syno815','192.168.1.43','ETH1','00:11:32:73:AE:89'),dev('Velop RDC','192.168.1.12','ETH2','11:11:11:11:11:11'),dev('Alexa salon','192.168.1.36','ETH2','F4:03:2A:14:D1:81'),dev('Congelateur','192.168.1.15','ETH4','AA:AA:AA:AA:AA:AA')];
const topo={nodes:[
 {id:'root',parent:null,kind:'device',name:'Livebox'},
 {id:'sw',parent:'root',kind:'switch',name:'Switch Mercusys'},
 {id:'ha',parent:'sw',kind:'device',mac:devices[0].mac,name:'HA'},
 {id:'nas',parent:'sw',kind:'device',mac:devices[1].mac,name:'Syno815'},
 {id:'sw-false',parent:'root',kind:'switch',name:'Switch'},
 {id:'v',parent:'sw-false',kind:'bridge',mac:devices[2].mac,name:'Velop RDC'},
 {id:'a',parent:'sw-false',kind:'device',mac:devices[3].mac,name:'Alexa salon'},
 {id:'c',parent:'root',kind:'device',mac:devices[4].mac,name:'Congelateur'}
]};
const getTree=(overrides={},velop=false)=>tree(devices,overrides,velop,topo);
const scan=(groups)=>{const all=[];function visit(n){all.push(n);(n.children||[]).forEach(visit);}groups.forEach(g=>g.roots.forEach(visit));return all;};
let groups=getTree();let all=scan(groups);
assert.equal(all.find(n=>n.name==='Switch Mercusys')?.children.length,2,'switch auto children');
assert.equal(all.find(n=>n.name==='HA')?.parentId, 'topo:sw');
assert.equal(all.find(n=>n.name==='Syno815')?.parentId,'topo:sw');
assert.equal(all.find(n=>n.name==='Alexa salon')?.parentId,'topo:sw-false','box inaccurate switch retained for review');
groups=getTree({},true);all=scan(groups);
assert.equal(all.find(n=>n.name==='Alexa salon')?.parentId,'device_tracker.velop_rdc','confirmed Velop rule wins');
const ov={['mac:'+devices[3].mac]:{parent:'interface',name:'Alexa test'}};
groups=getTree(ov,true);all=scan(groups);
assert.equal(all.find(n=>n.name==='Alexa test')?.parentId,null,'manual interface wins');
assert.equal(all.find(n=>n.name==='Congelateur')?.parentId,null,'no invented hub');
const garage=dev('Velop Garage','192.168.1.77','ETH4','00:00:00:00:00:77');
const garageGroups=tree([...devices,garage],{},true,topo,true);
const garageItems=scan(garageGroups);
assert.equal(garageItems.find(n=>n.name==='Congelateur')?.parentId,garage.entityId,'Velop Garage confirmed override');
const falseSwitchGroup=groups.find(g=>g.key==='eth:ETH2');
assert.equal(!!falseSwitchGroup,true,'ETH2 remains present');
console.log('TOPOLOGY_FRONT_TESTS_OK: 9 assertions');

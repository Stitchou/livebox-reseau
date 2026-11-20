/* Tests de non-régression v0.7.4, sans Livebox ni HAOS réels. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../custom_components/livebox_reseau/frontend/livebox-topologie-card.js','utf8');
const registry=new Map();
const ctx={window:{customCards:[]},customElements:{get:key=>registry.get(key),define:(k,x)=>registry.set(k,x)},HTMLElement:class{},console};
vm.createContext(ctx);vm.runInContext(source,ctx);
const get=name=>vm.runInContext(name,ctx);
const read=get('liveboxReadDevices'),tree=get('liveboxTree'),canon=get('liveboxCanonicalMac');
const link=get('liveboxLinksysAssociations'),isPlug=get('liveboxIsHomePlug');
const m=i=>'02:00:00:00:00:'+i.toString(16).padStart(2,'0').toUpperCase();
const raw=(name,mac,iface,type,ip='')=>({name,mac:m(mac),iface,type,ip});
const states={};
function tracker(name,num,iface,type,ip=''){
  const id='device_tracker.'+name.toLowerCase().replace(/[^a-z0-9]+/g,'_');
  states[id]={entity_id:id,state:'home',attributes:{friendly_name:name,ip,mac:m(num),interface_name:iface,
    connection:'ethernet',frequency_band:'Wired',source_type:'router',type}};
}
tracker('CPL Master',1,'ETH3','HomePlug');
tracker('CPL Spare1',2,'ETH3','HomePlug','192.0.2.39');
tracker('CPL Spare1_2.4',3,'ETH3','', '192.0.2.40');
tracker('Device-2536',4,'ETH3','HomePlug');
tracker('AP1300-Outdoor1',5,'ETH3','Access Point','192.0.2.71');
tracker('Beembox',6,'ETH3','AC Outlet');
tracker('Shelly Beem',7,'ETH3','AC Outlet');
tracker('Velop RDC',8,'ETH2','ExtenderWiFiPlus');
tracker('Velop Garage',9,'ETH4','ExtenderWiFiPlus');
tracker('Pompe Piscine',10,'ETH4','AC Outlet');
tracker('HAOS',11,'ETH1','Computer');
tracker('RDC Wifi',12,'ETH2','Computer');
const wifiList=[{mac:m(10),type:'wireless',band:'2.4GHz',rssi_dbm:-77,negotiated_mbps:39},
  {mac:m(11),type:'wired',band:null}];
states['sensor.garage_velop_garage_connected_devices']={entity_id:'sensor.garage_velop_garage_connected_devices',state:'14',
  attributes:{friendly_name:'Velop GARAGE Connected Devices',devices:wifiList}};
states['sensor.salon_velop_rdc_connected_devices']={entity_id:'sensor.salon_velop_rdc_connected_devices',state:'19',
  attributes:{friendly_name:'Velop RDC Connected Devices',devices:[{mac:m(12),type:'wireless',band:'5GHz'}]}};
const hass={states};
const devices=read(hass);
const topologyNodes=[
  {id:'box',name:'Livebox',parent:null,kind:'device'},
  {id:'plugMaster',parent:'box',mac:m(1),name:'CPL Master',kind:'cpl',device_type:'HomePlug'},
  {id:'plugSpare',parent:'box',mac:m(2),name:'CPL Spare1',kind:'cpl',device_type:'HomePlug'},
  {id:'ethernetA',parent:'plugSpare',name:'Ethernet',kind:'device'},
  {id:'radio24',parent:'ethernetA',mac:m(3),name:'CPL Spare1_2.4',kind:'device'},
  {id:'client6',parent:'ethernetA',mac:m(6),name:'Beembox',kind:'device'},
  {id:'client7',parent:'ethernetA',mac:m(7),name:'Shelly Beem',kind:'device'},
  {id:'plugOutdoor',parent:'box',mac:m(4),name:'Device-2536',kind:'cpl',device_type:'HomePlug'},
  {id:'ethernetB',parent:'plugOutdoor',name:'Ethernet',kind:'device'},
  {id:'cudy',parent:'ethernetB',mac:m(5),name:'AP1300-Outdoor1',kind:'access_point'},
  {id:'rdc',parent:'box',mac:m(8),name:'Velop RDC',kind:'repeater',device_type:'ExtenderWiFiPlus'},
  {id:'garage',parent:'box',mac:m(9),name:'Velop Garage',kind:'repeater',device_type:'ExtenderWiFiPlus'},
  {id:'pump',parent:'box',mac:m(10),name:'Pompe Piscine',kind:'device'},
  {id:'ha',parent:'box',mac:m(11),name:'HAOS',kind:'device'},
  {id:'rdcClient',parent:'box',mac:m(12),name:'RDC Wifi',kind:'device'}
];
const top={nodes:topologyNodes,count:topologyNodes.length};
function flatten(groups){const arr=[];function walk(n){arr.push(n);(n.children||[]).forEach(walk);}groups.forEach(g=>g.roots.forEach(walk));return arr;}
function find(groups,name){return flatten(groups).find(d=>d.originalName===name);}
const groups=tree(devices,{},true,top,true,hass);
assert.equal(groups.filter(x=>x.key==='eth:ETH3').length,1);
const master=find(groups,'CPL Master'),spare=find(groups,'CPL Spare1'),newPlug=find(groups,'Device-2536');
assert.equal(master.parentId,null,'Master racine ETH3');
assert.equal(spare.parentId,null,'Spare1 au même niveau que Master');
assert.equal(newPlug.parentId,null,'Nouveau CPL au même niveau que Master');
assert(isPlug(newPlug),'HomePlug détecté sans règle de nom');
assert.equal(find(groups,'AP1300-Outdoor1').parentId,newPlug.entityId,'Cudy sous Device-2536');
const band24=find(groups,'CPL Spare1_2.4');
assert.equal(band24.parentId,spare.entityId,'Spare1 -> 2.4 GHz');
assert.equal(band24.cplRadioBand,'2.4');
assert.equal(find(groups,'Beembox').parentId,band24.entityId,'Client unique radio connue');
assert.equal(find(groups,'Shelly Beem').parentId,band24.entityId);
assert.equal(find(groups,'Pompe Piscine').parentId,find(groups,'Velop Garage').entityId,'Association Linksys Garage par MAC');
assert.equal(find(groups,'Pompe Piscine').linksys.rssi,-77);
assert.equal(find(groups,'HAOS').parentId,null,'Linksys wired pas faussement rattaché');
assert.equal(find(groups,'RDC Wifi').parentId,find(groups,'Velop RDC').entityId);
assert.equal(flatten(groups).length,devices.length,'aucun appareil doublé');
const inst=Object.create(registry.get('livebox-topologie-card').prototype);
assert.equal(inst._nodeMedium(newPlug),'cpl','bulle HomePlug violette');
assert.equal(inst._nodeMedium(find(groups,'AP1300-Outdoor1')),'ethernet');
const moved=devices.map(d=>({...d,groupKey:d.groupKey==='eth:ETH3'?'eth:ETH4':d.groupKey==='eth:ETH4'?'eth:ETH3':d.groupKey,
  groupLabel:d.groupLabel.replace('ETH3','XXX').replace('ETH4','ETH3').replace('XXX','ETH4')}));
const movedGroups=tree(moved,{},true,top,true,hass);
assert.equal(find(movedGroups,'CPL Master').groupKey,'eth:ETH4');
assert.equal(find(movedGroups,'CPL Spare1_2.4').groupKey,'eth:ETH4');
assert.equal(find(movedGroups,'AP1300-Outdoor1').groupKey,'eth:ETH4');
const manual=tree(devices,{['mac:'+m(5)]:{group:'eth:ETH1'}},true,top,true,hass);
assert.equal(find(manual,'AP1300-Outdoor1').parentId,null,'Branche personnalisée respectée');
// Deux radios => pas de répartition inventée des enfants directs.
const devices5=[...devices,{...devices.find(x=>x.name==='CPL Spare1_2.4'),entityId:'device_tracker.spare_5',name:'CPL Spare1_5',mac:m(13)}];
const top5={nodes:[...topologyNodes,{id:'radio5',name:'CPL Spare1_5',parent:'ethernetA',mac:m(13),kind:'device'}]};
const group5=tree(devices5,{},true,top5,true,hass);
assert.equal(find(group5,'CPL Spare1_5').parentId,find(group5,'CPL Spare1').entityId);
assert.equal(find(group5,'Beembox').parentId,find(group5,'CPL Spare1').entityId,'Bande ambiguë, pas d’attribution à 2.4');
// Conflit Linksys : pas de parent inventé si les deux nœuds annoncent le même appareil.
const conflict={states:{...states,['sensor.salon_velop_rdc_connected_devices']:{
  entity_id:'sensor.salon_velop_rdc_connected_devices',state:'20',attributes:{friendly_name:'Velop RDC Connected Devices',
    devices:[{mac:m(10),type:'wireless',band:'2.4GHz'}]}}}};
assert.equal(link(devices,conflict).has(devices.find(d=>d.name==='Pompe Piscine').entityId),false);
// Trackers désactivés: inventaire Orange suffisant pour intégrer un HomePlug.
const missingStates={...states};delete missingStates['device_tracker.device_2536'];
const inventoried=read({states:missingStates},[{mac:m(4),name:'Device-2536',ip:'',interface_name:'ETH3',device_type:'HomePlug',active:true}]);
assert(inventoried.some(d=>d.name==='Device-2536'&&d.deviceType==='HomePlug'));
assert.equal(canon('02-00-00-00-00-04'),m(4).replace(/:/g,''));
console.log('V074_DYNAMIC_OK: 26 assertions métier + source Orange/Linksys + déplacements, 2 radios et trackers inactifs');

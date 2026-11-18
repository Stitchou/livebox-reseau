"""Validate the v0.7 layout with SYNTHETIC devices only (RFC 5737 IP addresses)."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
script=(root/'custom_components/livebox_reseau/frontend/livebox-topologie-card.js').read_text()
# NONE of the displayed names or IPs come from a private network.
items=[
 ('eth0-decoder','Décodeur',0),
 ('eth1-switch','Switch Ethernet',1),('eth1-nas','NAS',1),('eth1-server','Serveur',1),('eth1-camera','Caméra',1),
 ('eth2-ap','Point Wi-Fi RDC',2),('eth2-phone','Téléphone A',2),('eth2-tab','Tablette A',2),('eth2-alexa','Enceinte A',2),('eth2-cam','Caméra IP',2),
 ('eth2-sensor','Capteur A',2),('eth2-tv','TV salon',2),('eth2-printer','Imprimante',2),('eth2-box','Boîtier TV',2),
 ('eth3-printer','Imprimante réseau',3),
 ('eth4-cplmaster','CPL maître',4),('eth4-cplwifi','CPL Wi-Fi',4),('eth4-cplband','CPL Wi-Fi_2.4',4),
 ('eth4-socket','Prise connectée',4),('eth4-sensor','Capteur jardin',4),('eth4-plug','Module solaire',4),('eth4-meter','Compteur',4),
 ('eth4-garageap','Point Wi-Fi Garage',4),('eth4-phone','Téléphone B',4),('eth4-gateway','Passerelle IoT',4),
]
states={}; ids={}
for idx,(key,name,port) in enumerate(items,11):
    mac=f'02:00:00:00:00:{idx:02X}'
    eid='device_tracker.'+key.replace('-','_')
    ids[key]=(eid,mac)
    states[eid]={'entity_id':eid,'state':'home','attributes':{'friendly_name':name,'source_type':'router',
            'interface_name':'ETH'+str(port),'connection':'ethernet',
            'ip':'' if key in ('eth4-cplwifi','eth4-cplmaster') else f'192.0.2.{idx}', 'mac':mac}}
parent={
    'eth1-nas':'eth1-switch','eth1-server':'eth1-switch','eth1-camera':'eth1-switch',
    'eth2-phone':'eth2-ap','eth2-tab':'eth2-ap','eth2-alexa':'eth2-ap','eth2-cam':'eth2-ap',
    'eth2-sensor':'eth2-ap','eth2-tv':'eth2-ap','eth2-printer':'eth2-ap','eth2-box':'eth2-ap',
    'eth4-cplwifi':'eth4-cplmaster','eth4-cplband':'eth4-cplwifi',
    'eth4-socket':'eth4-cplband','eth4-sensor':'eth4-cplband',
    'eth4-plug':'eth4-cplband','eth4-meter':'eth4-cplband',
    'eth4-phone':'eth4-garageap','eth4-gateway':'eth4-garageap',
}
nodes=[]
for key,name,port in items:
    nodes.append({'id':key,'name':name,'kind':'cpl' if 'cpl' in key else ('switch' if 'switch' in key else ('repeater' if 'ap' in key else 'device')),
                  'mac':ids[key][1], 'parent':parent.get(key,'router'), 'children_count':0,'tags':[]})
nodes.insert(0,{'id':'router','name':'Livebox','parent':None,'kind':'router','mac':'','children_count':0,'tags':[]})
for n in nodes:n['children_count']=sum(1 for c in nodes if c['parent']==n['id'])
html='''<!doctype html><html><head><meta charset="utf-8"><style>
body{background:#0b1525;color:#f0f5fd;margin:0;padding:20px;font-family:Inter,Arial,sans-serif}
:root{--primary-text-color:#f0f5fd;--secondary-text-color:#a2b1c5;--card-background-color:#121e2d;--secondary-background-color:#1a273a;--divider-color:#3a5067;--primary-color:#13c0ed;--success-color:#34d488;--error-color:#f55}
ha-card{background:#101d30;border:1px solid #2e3c4d;}livebox-topologie-card{display:block;width:100%;max-width:1520px;margin:0 auto}
</style></head><body><livebox-topologie-card></livebox-topologie-card><script>
''' + script + '''
const el=document.querySelector('livebox-topologie-card');
const fake={states:''' +json.dumps(states,ensure_ascii=False)+ ''',connection:{
 sendMessagePromise:async msg => msg.type==='livebox_reseau/get'?{overrides:{},revision:1}:msg.type==='livebox_reseau/topology'?''' +json.dumps({'count':len(nodes),'nodes':nodes},ensure_ascii=False)+ ''':{},
 subscribeMessage:async ()=>()=>{}
 }};
el.setConfig({type:'custom:livebox-topologie-card',title:'Mon réseau Livebox — exemple fictif',router_name:'Routeur',router_ip:'192.0.2.1',auto_velop_rdc:false,auto_velop_garage:false});
el.hass=fake;
</script></body></html>'''
(root/'tests/test_v07_fixture.html').write_text(html)
with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
  try:
    page=browser.new_page(viewport={'width':1600,'height':1100},device_scale_factor=1)
    errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
    page.set_content(html,wait_until='domcontentloaded',timeout=20000)
    page.wait_for_function("document.querySelector('livebox-topologie-card')._topologyStatus==='ready'",timeout=5000)
    page.wait_for_function("document.querySelector('livebox-topologie-card').shadowRoot.querySelectorAll('.branch').length===5",timeout=5000)
    tree=page.evaluate("""() => {
      const el=document.querySelector('livebox-topologie-card');
      const g=el._getGroups().find(g=>g.key==='eth:ETH4');
      const master=g.roots.find(n=>n.name==='CPL maître');
      const wifi=master?.children.find(n=>n.name==='CPL Wi-Fi');
      return {master:!!master,wifi:!!wifi,ip:wifi?.ip,merged:wifi?.mergedEntityIds?.length,
              children:wifi?.children.map(n=>n.name).sort(),all:g.roots.flatMap(n=>[n.name,...n.children.map(c=>c.name)])};
    }""")
    assert tree['master'] and tree['wifi'],tree
    assert tree['ip'] == states[ids['eth4-cplband'][0]]['attributes']['ip'],tree
    assert tree['merged']==2,tree
    assert tree['children']==['Capteur jardin','Compteur','Module solaire','Prise connectée'],tree
    assert 'CPL Wi-Fi_2.4' not in tree['all'],tree
    root_locator=page.locator('livebox-topologie-card')
    assert root_locator.locator('.branch-head[aria-expanded="true"]').count()==5
    assert root_locator.locator('.cluster-children.cpl').count()==1
    assert root_locator.locator('.cluster-children.wifi').count()>=2
    assert root_locator.locator('.cluster-children.cpl .node-pill').count()==4
    assert root_locator.locator('.node-pill').count()==len(items)-1,root_locator.locator('.node-pill').count()
    assert not errors,errors
    page.screenshot(path=str(root/'assets/topologie-exemple-fictif.png'),full_page=True)
    root_locator.locator('#collapse-all').click()
    assert root_locator.locator('.branch-head[aria-expanded="false"]').count()==5
    root_locator.locator('#expand-all').click()
    assert root_locator.locator('.branch-head[aria-expanded="true"]').count()==5
    root_locator.locator('.node-pill').filter(has_text='CPL Wi-Fi').first.click()
    assert root_locator.locator('#detail.visible').count()==1
    print('DESKTOP_OK: ETH0-4, merged CPL with inherited IP, violet group, two green Wi-Fi groups, 24 visible devices')
    mobile=browser.new_page(viewport={'width':375,'height':850},device_scale_factor=1)
    mobile_errors=[];mobile.on('pageerror',lambda err:mobile_errors.append(str(err)))
    mobile.set_content(html,wait_until='domcontentloaded',timeout=20000)
    mobile.wait_for_function("document.querySelector('livebox-topologie-card').shadowRoot.querySelectorAll('.branch').length===5",timeout=5000)
    assert mobile.locator('livebox-topologie-card .branch-head[aria-expanded="false"]').count()==5
    mobile.locator('livebox-topologie-card #expand-all').click()
    assert mobile.locator('livebox-topologie-card .node-pill').count()==len(items)-1
    dims=mobile.evaluate("""() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]""")
    assert dims[0]<=dims[1]+2,dims
    mobile.screenshot(path=str(root/'assets/topologie-mobile-fictif.png'),full_page=True)
    assert not mobile_errors,mobile_errors
    print('MOBILE_OK: 375px, branches collapsed initially, no horizontal document overflow')
  finally:
    browser.close()

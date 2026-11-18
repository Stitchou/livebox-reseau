"""Local-only Playwright integration checks with deliberately fictitious network devices."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
js=(root/'custom_components/livebox_reseau/frontend/livebox-topologie-card.js').read_text()
# Every name and address is synthetic. No real home network data in this fixture.
items=[
 ('eth0-tv','Téléviseur',0),
 ('eth1-switch','Switch 5 ports',1),('eth1-nas','NAS',1),('eth1-server','Serveur domotique',1),
 ('eth2-ap','Point d’accès RDC',2),('eth2-phone','Téléphone A',2),('eth2-tab','Tablette A',2),
 ('eth2-alexa','Enceinte A',2),('eth2-cam','Caméra IP',2),('eth2-sensor','Capteur A',2),
 ('eth2-tv','TV salon',2),('eth2-printer','Imprimante',2),('eth2-box','Boîtier TV',2),
 ('eth3-printer','Imprimante réseau',3),
 ('eth4-cplmaster','CPL maître',4),('eth4-cplslave','CPL secondaire',4),
 ('eth4-socket','Prise connectée',4),('eth4-sensor','Capteur jardin',4),
 ('eth4-garageap','Point d’accès Garage',4),('eth4-phone','Téléphone B',4),('eth4-gateway','Passerelle IoT',4),
]
states={}; ids={}
for idx,(key,name,port) in enumerate(items,11):
    mac=f'02:00:00:00:00:{idx:02X}'
    eid='device_tracker.'+key.replace('-','_')
    ids[key]=(eid,mac)
    states[eid]={'entity_id':eid,'state':'home','attributes':{
        'friendly_name':name,'source_type':'router','interface_name':'ETH'+str(port),
        'connection':'ethernet','ip':f'192.0.2.{idx}', 'mac':mac}}

parent={
    'eth1-nas':'eth1-switch','eth1-server':'eth1-switch',
    'eth2-phone':'eth2-ap','eth2-tab':'eth2-ap','eth2-alexa':'eth2-ap','eth2-cam':'eth2-ap',
    'eth2-sensor':'eth2-ap','eth2-tv':'eth2-ap','eth2-printer':'eth2-ap','eth2-box':'eth2-ap',
    'eth4-cplslave':'eth4-cplmaster','eth4-socket':'eth4-cplslave','eth4-sensor':'eth4-cplslave',
    'eth4-phone':'eth4-garageap','eth4-gateway':'eth4-garageap'
}
nodes=[]
for key,name,port in items:
    nodes.append({'id':key,'name':name,'kind':'cpl' if 'cpl' in key else ('switch' if 'switch' in key else ('repeater' if 'ap' in key else 'device')),
                  'mac':ids[key][1], 'parent':parent.get(key,'router'), 'children_count':0,'tags':[]})
nodes.insert(0,{'id':'router','name':'Livebox','parent':None,'kind':'router','mac':'','children_count':0,'tags':[]})
for n in nodes:n['children_count']=sum(1 for c in nodes if c['parent']==n['id'])
jsonstates=json.dumps(states,ensure_ascii=False)
jsontopo=json.dumps({'count':len(nodes),'nodes':nodes},ensure_ascii=False)
# JavaScript fetched via mocked Home Assistant WebSocket and any persisted overrides empty.
html='''<!doctype html><html><head><meta charset="utf-8"><style>
body{background:#121a27;color:#f0f5fd;margin:0;padding:20px;font-family:Inter,Arial,sans-serif}
:root{--primary-text-color:#f0f5fd;--secondary-text-color:#a2b1c5;--card-background-color:#131d2b;--secondary-background-color:#1d2a3b;--divider-color:#3a5067;--primary-color:#13c0ed;--success-color:#34d488;--error-color:#f55}
ha-card{background:#151e2b;border:1px solid #2e3c4d;} livebox-topologie-card{display:block;width:100%;max-width:1520px;margin:0 auto}
</style></head><body><livebox-topologie-card></livebox-topologie-card><script>
''' + js + '''
const el=document.querySelector('livebox-topologie-card');
const fake={states:''' +jsonstates+ ''',connection:{
 sendMessagePromise:async msg => msg.type==='livebox_reseau/get'?{overrides:{},revision:1}:msg.type==='livebox_reseau/topology'?''' +jsontopo+ ''':{},
 subscribeMessage:async ()=>()=>{}
 }};
el.setConfig({type:'custom:livebox-topologie-card',title:'Mon réseau Livebox — exemple fictif',router_name:'Livebox 7',router_ip:'192.0.2.1',auto_velop_rdc:false,auto_velop_garage:false});
el.hass=fake;
</script></body></html>'''
(root/'tests/test_v06_fixture.html').write_text(html)
with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
  try:
    page=browser.new_page(viewport={'width':1600,'height':1100},device_scale_factor=1)
    errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
    page.set_content(html,wait_until='domcontentloaded',timeout=20000)
    page.wait_for_function("document.querySelector('livebox-topologie-card').shadowRoot.querySelectorAll('.branch').length===5",timeout=5000)
    page.wait_for_function("document.querySelector('livebox-topologie-card').shadowRoot.querySelectorAll('.node-pill').length>=20",timeout=5000)
    assert page.locator('livebox-topologie-card .branch-head[aria-expanded="true"]').count()==5
    assert page.locator('livebox-topologie-card .node-cluster.cpl').count()>=2
    assert page.locator('livebox-topologie-card .node-pill').count()==len(items)
    # All mocked synthetic parent relationships preserved through Children
    tree=page.evaluate("""() => {
      const el=document.querySelector('livebox-topologie-card');
      const g=el._getGroups().find(g=>g.key==='eth:ETH4');
      const parent=g.roots.find(x=>x.name==='CPL maître');
      return [parent?.children.map(x=>x.name)||[],parent?.children.find(x=>x.name==='CPL secondaire')?.children.map(x=>x.name)||[]];
    }""")
    assert tree==[['CPL secondaire'],['Capteur jardin','Prise connectée']],tree
    assert not errors,errors
    page.screenshot(path=str(root/'assets/topologie-exemple-fictif.png'),full_page=True)
    page.locator('livebox-topologie-card #collapse-all').click()
    assert page.locator('livebox-topologie-card .branch-head[aria-expanded="false"]').count()==5
    page.locator('livebox-topologie-card #expand-all').click()
    assert page.locator('livebox-topologie-card .branch-head[aria-expanded="true"]').count()==5
    page.locator('livebox-topologie-card .node-pill').filter(has_text='CPL maître').click()
    assert page.locator('livebox-topologie-card #detail.visible').count()==1
    assert not errors,errors
    print('DESKTOP_OK: 5 expanded ETH,',len(items),'fictitious devices, CPL hierarchy, collapse/expand, clicks')
    # Mobile first render uses collapsed list; expand all then check availability.
    mobile=browser.new_page(viewport={'width':375,'height':850},device_scale_factor=1)
    mobile_errors=[];mobile.on('pageerror',lambda e:mobile_errors.append(str(e)))
    mobile.set_content(html,wait_until='domcontentloaded',timeout=20000)
    mobile.wait_for_function("document.querySelector('livebox-topologie-card').shadowRoot.querySelectorAll('.branch').length===5",timeout=5000)
    assert mobile.locator('livebox-topologie-card .branch-head[aria-expanded="false"]').count()==5
    mobile.locator('livebox-topologie-card #expand-all').click()
    assert mobile.locator('livebox-topologie-card .node-pill').count()==len(items)
    # Check document overflow on small screen (shadow content may overflow but element width must not).
    dims=mobile.evaluate("""() => [document.documentElement.scrollWidth,document.documentElement.clientWidth]""")
    assert dims[0]<=dims[1]+2,dims
    mobile.screenshot(path=str(root/'assets/topologie-mobile-fictif.png'),full_page=True)
    assert not mobile_errors,mobile_errors
    print('MOBILE_OK: 375px, collapsed default, all expandable, no horizontal page overflow')
  finally:
    browser.close()

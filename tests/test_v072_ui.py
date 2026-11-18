"""Vérifie en Chromium les relations confirmées, avec des noms/IP fictifs uniquement."""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'tests/test_v07_fixture.html').read_text()
# Seuls les noms d'équipements génériques apparaissent sur les captures publiées.
html=html.replace('CPL maître','CPL Master').replace('CPL Wi-Fi_2.4','CPL Spare1_2.4').replace('CPL Wi-Fi','CPL Spare1').replace('Point Wi-Fi RDC','Velop RDC')
# L'ancienne option désactivée doit être ignorée après migration 0.7.2.
assert 'auto_velop_rdc:false' in html
with sync_playwright() as pw:
    b=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
    try:
        page=b.new_page(viewport={'width':1750,'height':1100},device_scale_factor=1)
        errors=[]
        page.on('pageerror',lambda exc:errors.append(str(exc)))
        page.set_content(html,wait_until='domcontentloaded')
        page.wait_for_function("document.querySelector('livebox-topologie-card')?._topologyStatus==='ready'",timeout=8000)
        page.wait_for_function("document.querySelector('livebox-topologie-card')?.shadowRoot?.querySelectorAll('.branch').length===5",timeout=8000)
        page.wait_for_function("document.querySelector('livebox-topologie-card')?.shadowRoot?.querySelectorAll('.network-wires path').length>12",timeout=8000)
        tree=page.evaluate('''() => {
          const el=document.querySelector('livebox-topologie-card');
          const g=el._getGroups(), eth4=g.find(g=>g.key==='eth:ETH4'),eth2=g.find(g=>g.key==='eth:ETH2');
          const master=eth4.roots.find(n=>n.name==='CPL Master');
          const spare=master?.children.find(n=>n.name==='CPL Spare1');
          const rdc=eth2.roots.find(n=>n.name==='Velop RDC');
          const s=el.shadowRoot;
          const p=s.querySelector('.node-cluster.cpl-master > .cluster-main > .node-pill');
          const nested=s.querySelector('.node-cluster.cpl-master > .cluster-children .node-cluster.cpl-wifi > .cluster-main > .node-pill');
          const paths=[...s.querySelectorAll('.network-wires path')];
          const colors=paths.filter(p=>p.getAttribute('stroke')==='var(--lb-purple)');
          const ar=p?.getBoundingClientRect(),br=nested?.getBoundingClientRect(),network=s.querySelector('.network').getBoundingClientRect();
          const purpleFromMaster=colors.some(p=>{const d=p.getAttribute('d');
              return ar && d.startsWith('M '+(ar.right-network.left)+' ');
          });
          return {eth2_roots:eth2.roots.map(n=>n.name),rdc_clients:rdc?.children.length,
             master:!!master,spare:!!spare,spare_parent:spare?.parentId,spare_ip:spare?.ip,
             spare_children:spare?.children.length,merge:spare?.mergedEntityIds.length,
             masterNodeId:master?.entityId,cplCluster:!!p,cplChild:!!nested,
             purpleWires:colors.length,purpleFromMaster,
             masterBorder:p&&getComputedStyle(p).borderColor,
             grouped:s.querySelectorAll('.cluster-children.cpl').length,
             count:s.querySelectorAll('.node-pill').length};
        }''')
        assert tree['eth2_roots']==['Velop RDC'],tree
        assert tree['rdc_clients']==8,tree
        assert tree['master'] and tree['spare'] and tree['spare_parent']==tree['masterNodeId'],tree
        assert tree['spare_ip'].startswith('192.0.2.') and tree['merge']==2 and tree['spare_children']==4,tree
        assert tree['cplCluster'] and tree['cplChild'] and tree['grouped']==1,tree
        assert tree['purpleWires']>=2 and tree['purpleFromMaster'],tree
        assert tree['masterBorder']=='rgb(200, 93, 245)',tree
        assert not errors,errors
        page.screenshot(path=str(root/'assets/topologie-exemple-fictif.png'),full_page=True)
        mobile=b.new_page(viewport={'width':375,'height':850},device_scale_factor=1)
        mobile.set_content(html,wait_until='domcontentloaded')
        mobile.wait_for_function("document.querySelector('livebox-topologie-card')?.shadowRoot?.querySelectorAll('.branch').length===5",timeout=8000)
        mobile.locator('livebox-topologie-card #expand-all').click()
        mobile.wait_for_function("document.querySelector('livebox-topologie-card')?.shadowRoot?.querySelectorAll('.node-pill').length>=23",timeout=8000)
        sizes=mobile.evaluate('''() => [document.documentElement.scrollWidth,document.documentElement.clientWidth]''')
        assert sizes[0]<=sizes[1]+2,sizes
        mobile.screenshot(path=str(root/'assets/topologie-mobile-fictif.png'),full_page=True)
        print('V072_UI_OK: Velop RDC unique parent ETH2, CPL Master violet → Spare1 violet → groupe CPL, IP preserved, SVG purple, 375px no overflow')
    finally:b.close()

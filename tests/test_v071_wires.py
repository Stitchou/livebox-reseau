"""Verify curved connectors with synthetic data only; no Livebox access needed."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
fixture=root/'tests/test_v07_fixture.html'
assert fixture.exists(), 'Run tests/test_v07_ui.py first to create the synthetic fixture'
html=fixture.read_text()
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
    try:
        desktop=browser.new_page(viewport={'width':1600,'height':1100})
        desktop.set_content(html,wait_until='domcontentloaded')
        desktop.wait_for_function("document.querySelector('livebox-topologie-card')?.shadowRoot?.querySelectorAll('.branch').length===5")
        desktop.wait_for_function("document.querySelector('livebox-topologie-card')?.shadowRoot?.querySelectorAll('.network-wires path').length>9")
        get=lambda: desktop.evaluate("""() => {
          const s=document.querySelector('livebox-topologie-card').shadowRoot;
          const net=s.querySelector('.network');const svg=s.querySelector('.network-wires');
          const heads=[...s.querySelectorAll('.branch-head')];
          const r=net.getBoundingClientRect();
          const centers=heads.map(h=>{let b=h.getBoundingClientRect();return (b.top+b.bottom)/2-r.top});
          const trunk=svg.querySelector('[data-wire="main-trunk"]');
          const bbox=trunk?.getBBox();
          const paths=[...svg.querySelectorAll('path')];
          return {centers,bbox: bbox?{y:bbox.y,b:bbox.y+bbox.height}:null,
            count:paths.length, d:trunk?.getAttribute('d')||'',
            hasCurves:paths.some(p=>/Q|C/.test(p.getAttribute('d'))),
            oldBorders:getComputedStyle(s.querySelector('.branches')).borderLeftWidth,
            width:svg.getAttribute('width'),netWidth:net.clientWidth};
        }""")
        a=get()
        assert a['bbox'] and a['hasCurves'] and a['count']>9, a
        assert a['oldBorders']=='0px',a
        assert a['bbox']['y'] >= a['centers'][0]-0.5, a
        assert a['bbox']['b'] <= a['centers'][-1]+0.5, a
        assert int(a['width'])==a['netWidth'],a
        # Explicitly resize dashboard: connections must realign without rebuilding nodes.
        desktop.evaluate("document.querySelector('livebox-topologie-card').style.width='760px'")
        desktop.wait_for_function("document.querySelector('livebox-topologie-card').shadowRoot.querySelector('.network-wires').getAttribute('width') < 800")
        b=get()
        assert int(b['width'])==b['netWidth'] and a['width']!=b['width'],(a,b)
        assert b['bbox']['y'] >= b['centers'][0]-0.5 and b['bbox']['b'] <= b['centers'][-1]+0.5,b
        desktop.locator('livebox-topologie-card #collapse-all').click()
        desktop.wait_for_timeout(90)
        c=get()
        assert c['bbox']['y'] >= c['centers'][0]-0.5 and c['bbox']['b'] <= c['centers'][-1]+0.5,c
        desktop.locator('livebox-topologie-card #expand-all').click()
        desktop.wait_for_timeout(90)
        assert get()['count']>9
        print('WIRES_DESKTOP_OK: curved SVG paths, bounded backbone ETH0–ETH4, resize and collapse/reopen')

        mobile=browser.new_page(viewport={'width':375,'height':850})
        mobile.set_content(html,wait_until='domcontentloaded')
        mobile.wait_for_function("document.querySelector('livebox-topologie-card')?.shadowRoot?.querySelectorAll('.branch').length===5")
        mobile.locator('livebox-topologie-card #expand-all').click()
        mobile.wait_for_function("document.querySelector('livebox-topologie-card').shadowRoot.querySelectorAll('.network-wires path').length > 9")
        m=mobile.evaluate("""() => {
          const s=document.querySelector('livebox-topologie-card').shadowRoot;
          const net=s.querySelector('.network');const r=net.getBoundingClientRect();
          const p=s.querySelector('[data-wire="main-trunk"]');const bbox=p.getBBox();
          const heads=[...s.querySelectorAll('.branch-head')].map(el=>{let b=el.getBoundingClientRect();return (b.top+b.bottom)/2-r.top});
          return {y:bbox.y,b:bbox.y+bbox.height,heads,scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth};
        }""")
        assert m['y']>=m['heads'][0]-0.5 and m['b']<=m['heads'][-1]+0.5,m
        assert m['scroll']<=m['client']+2,m
        print('WIRES_MOBILE_OK: bounded backbone, connectors gutter, no horizontal overflow')
    finally:
        browser.close()

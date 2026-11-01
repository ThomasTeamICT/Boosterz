// Rooktest van het prototype (diorama's): serveert html + modules + three.js en de voorbeelden van r128 lokaal.
const { chromium } = require('playwright'); const fs=require('fs'), path=require('path');
const D=process.argv[2]; const BESTAND=process.argv[3]||'lichtkamer.html'; const OUT=process.argv[4]||'shots'; const STAPPEN=process.argv[5]||'alles';
// three.js r128 lokaal: `npm pack three@0.128.0` uitpakken en de map 'package' meegeven met THREE_PKG
const PKG=process.env.THREE_PKG || path.join(D,'../three/pkg/package');
fs.mkdirSync(path.resolve(D,OUT),{recursive:true});
(async()=>{
  const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']}); const errs=[];
  async function open(vp, scheme){
    const ctx=await b.newContext({viewport:vp, colorScheme:scheme||'light'}); const p=await ctx.newPage();
    p.on('pageerror',e=>errs.push(`[${vp.width}] pageerror: ${e.message}`)); p.on('console',m=>{ if(m.type()==='error'||m.type()==='warning') errs.push(`[${vp.width}] ${m.type()}: ${m.text().slice(0,300)}`); });
    const body=fs.readFileSync(path.join(D,BESTAND),'utf8');
    const html='<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}</style></head><body>'+body+'</body></html>';
    await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(path.join(PKG,'build/three.min.js'),'utf8')}));
    await p.route('https://cdn.jsdelivr.net/npm/three@0.128.0/**',r=>{ const rel=r.request().url().split('three@0.128.0/')[1]; const f=path.join(PKG,rel); if(fs.existsSync(f)) r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(f,'utf8')}); else r.fulfill({status:404,body:''}); });
    await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''})); await p.route('https://fonts.gstatic.com/**',r=>r.abort());
    await p.route('http://test.local/**',r=>{ const u=new URL(r.request().url()); if(u.pathname==='/'||u.pathname==='') return r.fulfill({status:200,contentType:'text/html',body:html}); const f=path.join(D,u.pathname.slice(1)); if(fs.existsSync(f)) return r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(f,'utf8')}); return r.fulfill({status:404,body:''}); });
    await p.goto('http://test.local/'); await p.waitForTimeout(2500); return {ctx,p};
  }
  const shot=async(p,n)=>{ await p.waitForTimeout(1200); await p.screenshot({path:path.resolve(D,OUT,n+'.png')}); };
  let {ctx,p}=await open({width:1440,height:900});
  const stap = (n)=> STAPPEN==='alles' || STAPPEN.split(',').includes(n);
  if(stap('4')){ await shot(p,'a-4-schaduw'); await p.locator('#voorspelWrap .opt').first().click(); await shot(p,'b-4-schaduw-toon');
    await p.locator('.taak[data-i="1"]').click(); await p.getByRole('button',{name:'Gaatje 3 (bij het scherm) hoger'}).click(); await p.getByRole('button',{name:'Gaatje 2 lager'}).click(); await shot(p,'c-4-kaartjes');
    await p.locator('.taak[data-i="2"]').click(); await p.getByRole('button',{name:'10 cm'}).first().click(); await shot(p,'d-4-onderzoek'); }
  if(stap('k')){ await p.getByRole('button',{name:'Einde kleuter'}).click(); await shot(p,'e-k-donker');
    await p.getByRole('button',{name:'De lamp'}).click(); await p.getByRole('button',{name:'De kaars'}).click(); await p.getByRole('button',{name:'De zaklamp'}).click(); await shot(p,'f-k-licht');
    await p.locator('.taak[data-i="1"]').click(); await shot(p,'g-k-spiegel'); for(let i=0;i<5;i++) await p.getByRole('button',{name:'Draai de spiegel naar rechts'}).click(); await shot(p,'h-k-spiegel-raak');
    await p.locator('.taak[data-i="2"]').click(); await shot(p,'i-k-schaduw'); }
  if(stap('6')){ await p.getByRole('button',{name:'6de leerjaar'}).click(); await shot(p,'j-6-stoffen'); await p.locator('#stofKeuze button[data-id="spiegel"]').click(); await p.getByRole('button',{name:'Meet'}).click(); await shot(p,'k-6-spiegel');
    await p.locator('#stofKeuze button[data-id="glas"]').click(); await shot(p,'l-6-glas');
    await p.locator('.taak[data-i="1"]').click(); await shot(p,'m-6-gordijn'); }
  if(stap('bord')){ await p.getByRole('button',{name:'Digibord'}).click(); await p.getByRole('button',{name:'4de leerjaar'}).click(); await shot(p,'n-bord-4'); }
  await ctx.close();
  if(stap('gsm')){ ({ctx,p}=await open({width:390,height:844},'dark')); await shot(p,'o-gsm'); console.log('scroll 390:', await p.evaluate(()=>[document.documentElement.scrollWidth, document.documentElement.clientWidth])); await ctx.close(); }
  await b.close(); console.log('ERRORS:\n'+errs.join('\n'));
})();

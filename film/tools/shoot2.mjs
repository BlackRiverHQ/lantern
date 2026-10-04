import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.CHROME });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
for (const [path, name] of [['/dashboard','overview'],['/dashboard/run','run'],['/dashboard/prove','prove'],['/dashboard/cases','cases'],['/dashboard/feeds','feeds']]) {
  try { await p.goto('https://friendly-fennec-31.convex.site'+path, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(4000); await p.screenshot({ path: `assets/shots/${name}.png` });
  console.log(name, p.url(), (await p.innerText('body')).slice(0,1500).replace(/\n+/g,' | ')); } catch(e){ console.log(name,'ERR',e.message) }
}
await b.close();

import assert from 'node:assert/strict';
import { createServer } from 'vite';

const { chromium } = await import(process.env.UI_PLAYWRIGHT_PATH || 'playwright');
const server = await createServer({server:{host:'127.0.0.1',port:4179,strictPort:true},optimizeDeps:{entries:['tests/ui/index.html']}});
await server.listen();
let browser;
try {
  browser = await chromium.launch({headless:true});
  const context = await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await context.route(/https:\/\//, route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4179/tests/ui/index.html');
  await page.getByRole('button',{name:'Continue campaign',exact:true}).waitFor();
  await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:'Character',exact:false}).click();
  await page.getByRole('dialog',{name:'Character',exact:true}).getByRole('button',{name:'Item Catalogue',exact:false}).click();
  const open = page.getByRole('button',{name:'View Ash Dress Shoes record',exact:true});
  await open.waitFor();
  await open.click();
  const record = page.getByRole('dialog',{name:'Ash Dress Shoes',exact:true});
  await record.waitFor();
  assert.equal(await record.getByRole('heading',{name:'Ash Dress Shoes',exact:true}).count(),1);
  assert.equal(await record.getByText('How to obtain',{exact:true}).count(),1);
  await record.getByRole('button',{name:'Close item record',exact:true}).click();
  assert.equal(await record.count(),0);
  assert.deepEqual(errors,[],'catalogue interaction must not raise browser errors');
  console.log('Catalogue browser check passed: real record button opens and closes the item dialog at 390x844.');
} finally {
  await browser?.close();
  await server.close();
}

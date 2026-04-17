const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });

  const filePath = 'file:///' + path.resolve(__dirname, 'og-preview.html').replace(/\\/g, '/');
  await page.goto(filePath, { waitUntil: 'networkidle0' });
  await page.waitForSelector('canvas');
  await new Promise(r => setTimeout(r, 500));

  // Export canvas as JPEG via JS
  const base64 = await page.evaluate(() => {
    const canvas = document.getElementById('c');
    return canvas.toDataURL('image/jpeg', 0.95);
  });

  const b64 = base64.replace(/^data:image\/jpeg;base64,/, '');
  const buf = Buffer.from(b64, 'base64');
  require('fs').writeFileSync(path.join(__dirname, 'og-image.jpg'), buf);
  console.log('Saved og-image.jpg — ' + buf.length + ' bytes');

  await browser.close();
})();

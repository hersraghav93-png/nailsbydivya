const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 8088;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon'
};

// Start static server
const server = http.createServer((req, res) => {
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
  const filePath = path.join(ROOT, reqPath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.statusCode = 404;
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, async () => {
  console.log(`Static server running on http://127.0.0.1:${PORT}`);

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const debuggingPort = 9222;

  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--remote-debugging-port=${debuggingPort}`,
    'about:blank'
  ]);

  chromeProc.on('error', (err) => {
    console.error('Failed to spawn Chrome:', err);
    server.close();
    process.exit(1);
  });

  // Wait for Chrome CDP endpoint
  async function waitForChrome() {
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${debuggingPort}/json/version`);
        if (res.ok) {
          const json = await res.json();
          return json.webSocketDebuggerUrl;
        }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 200));
    }
    throw new Error('Chrome did not start in time');
  }

  try {
    const wsUrl = await waitForChrome();
    console.log('Connected to Chrome via CDP:', wsUrl);

    // Create a new target/page
    const newTargetRes = await fetch(`http://127.0.0.1:${debuggingPort}/json/new?http://127.0.0.1:${PORT}/index.html`, { method: 'PUT' });
    const targetData = await newTargetRes.json();
    const pageWsUrl = targetData.webSocketDebuggerUrl;

    const ws = new WebSocket(pageWsUrl);

    let id = 1;
    const callbacks = new Map();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        const { resolve, reject } = callbacks.get(msg.id);
        callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    function sendCommand(method, params = {}) {
      return new Promise((resolve, reject) => {
        const cmdId = id++;
        callbacks.set(cmdId, { resolve, reject });
        ws.send(JSON.stringify({ id: cmdId, method, params }));
      });
    }

    await sendCommand('Page.enable');
    await sendCommand('Runtime.enable');
    await sendCommand('DOM.enable');

    const pages = [
      'index.html',
      'account.html',
      'nail-art.html',
      'nail-extensions.html',
      'press-on-nails-india.html'
    ];

    const viewports = [
      { name: 'desktop', width: 1200, height: 800, isMobile: false },
      { name: 'tablet-768', width: 768, height: 1024, isMobile: true },
      { name: 'mobile-375', width: 375, height: 667, isMobile: true },
      { name: 'mobile-320', width: 320, height: 568, isMobile: true }
    ];

    let totalOverflowErrors = 0;

    for (const page of pages) {
      console.log(`\n========================================\nPAGE: ${page}\n========================================`);
      for (const vp of viewports) {
        await sendCommand('Emulation.setDeviceMetricsOverride', {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: 1,
          mobile: vp.isMobile
        });

        await sendCommand('Page.navigate', { url: `http://127.0.0.1:${PORT}/${page}` });
        await new Promise(r => setTimeout(r, 600));

        const overflowEval = await sendCommand('Runtime.evaluate', {
          expression: `(() => {
            const docEl = document.documentElement;
            const body = document.body;
            const clientWidth = docEl.clientWidth;
            const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
            const hasOverflow = scrollWidth > clientWidth;

            const overflowing = [];
            document.querySelectorAll('*').forEach(el => {
              const rect = el.getBoundingClientRect();
              if (rect.right > clientWidth + 1) {
                overflowing.push({
                  tag: el.tagName,
                  class: el.className,
                  id: el.id,
                  right: Math.round(rect.right),
                  clientWidth: clientWidth
                });
              }
            });

            return {
              clientWidth,
              scrollWidth,
              hasOverflow,
              overflowing: overflowing.slice(0, 10)
            };
          })()`,
          returnByValue: true
        });

        const res = overflowEval.result.value;
        const pageClean = page.replace('.html', '');
        if (res.hasOverflow) {
          totalOverflowErrors++;
          console.warn(`  ❌ [${pageClean}] ${vp.name} (${vp.width}px): OVERFLOW! scrollWidth: ${res.scrollWidth}px > clientWidth: ${res.clientWidth}px`);
          console.warn('     Overflowing elements:', JSON.stringify(res.overflowing, null, 2));
        } else {
          console.log(`  ✓ [${pageClean}] ${vp.name} (${vp.width}px): perfect fit (${res.scrollWidth}px / ${res.clientWidth}px)`);
        }

        // Save screenshot for mobile-375 and desktop
        if (vp.name === 'mobile-375' || vp.name === 'desktop') {
          const screenshot = await sendCommand('Page.captureScreenshot', { format: 'png' });
          const imgBuffer = Buffer.from(screenshot.data, 'base64');
          fs.writeFileSync(path.join(ROOT, `preview-${pageClean}-${vp.name}.png`), imgBuffer);
        }
      }
    }

    console.log(`\nTotal page-viewport overflow errors: ${totalOverflowErrors}`);

    ws.close();
  } catch (err) {
    console.error('CDP test error:', err);
  } finally {
    chromeProc.kill();
    server.close();
    console.log('\nHeadless Chrome testing finished.');
  }
});

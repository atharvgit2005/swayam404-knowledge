import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const COOKIES = [
  {
    name: 'g_a',
    value: 'OLrDSqGIELJFbx4xmq6s5bIPM+bCZ0+h3Wq96uNkXN8nhAc8puRwt1u4DXf6y/F4',
    domain: 'onlinecourses.swayam2.ac.in',
    path: '/',
    secure: true,
    httpOnly: true,
  },
  {
    name: 'g_b',
    value: 'VA3zM261IZZDhb9w7bEnnEGJGtRZoTJC1BfPaAWneo65eMYV5Hj2GpzolkzLy+bi',
    domain: 'onlinecourses.swayam2.ac.in',
    path: '/',
    secure: true,
    httpOnly: true,
  },
  {
    name: 'g_c',
    value: 'Wbbxvs/+wtEUoAU32bdkpogxHX0aLlA2rgExbtlf9VIQP9nocSYx28EZAoTzeHvMLtCMxYyYz+cN0rOkNEWBXWeRGV6P1by9sovsg4hnPQ4YS+zRyOsKsfz/VrqQeqIRCLRFYfpGuT8aeUFU3KHitxw4nIqKkBwMwv3EW60+/KYy3Asst8fEi1b84+T09k23U2kfJsVHnHX8ybbfFf7gvKBvshX3pyx/WW3ZgE7i9viXzx0ZX/287dNYyAnjC+zq5Rxhgc47ulxQZldctDOlhGjB8WKyYxisKtsqvn0wmlagsA0snvChEIHv5D1FY8jx',
    domain: 'onlinecourses.swayam2.ac.in',
    path: '/',
    secure: true,
    httpOnly: true,
  },
];

async function run() {
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--no-sandbox',
    '--disable-gpu',
    '--user-data-dir=/tmp/chrome-swayam-inspect'
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  // Open a new tab
  const tab = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 9222,
      path: '/json/new',
      method: 'PUT'
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });

  console.log('Opened tab:', tab.id, tab.webSocketDebuggerUrl);

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };

  const send = (method, params = {}) => {
    const msgId = id++;
    return new Promise((resolve) => {
      pending.set(msgId, resolve);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  };

  await new Promise((r) => (ws.onopen = r));

  console.log('Setting cookies...');
  await send('Network.enable');
  await send('Network.setCookies', { cookies: COOKIES });

  console.log('Navigating to assessment...');
  await send('Page.enable');
  await send('Page.navigate', {
    url: 'https://onlinecourses.swayam2.ac.in/e-learning/course/ini26_cm22?unitId=26&assessmentId=118',
  });

  // Wait for rendering
  console.log('Waiting 10s for page to render...');
  await new Promise((r) => setTimeout(r, 10000));

  // Capture screenshot
  const screenshotRes = await send('Page.captureScreenshot');
  if (screenshotRes.result?.data) {
    fs.mkdirSync('.planning/debug', { recursive: true });
    fs.writeFileSync('.planning/debug/swayam-page.png', Buffer.from(screenshotRes.result.data, 'base64'));
    console.log('Screenshot saved to .planning/debug/swayam-page.png');
  }

  // Get DOM evaluation
  const evalRes = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
        if (radios.length === 0) return JSON.stringify({ error: "no radios" });
        const firstRadio = radios[0];
        const q1Name = firstRadio.name;
        const q1Radios = Array.from(document.querySelectorAll(\`input[name="\${q1Name}"]\`));
        let parent = q1Radios[0].parentElement;
        while (parent && !q1Radios.every(r => parent.contains(r))) {
          parent = parent.parentElement;
        }

        const card = parent ? parent.parentElement : null;
        const grand = card ? card.parentElement : null;

        return JSON.stringify({
          q1Name,
          radioCount: radios.length,
          cardTag: card ? card.tagName : null,
          cardClass: card ? card.className : null,
          cardId: card ? card.id : null,
          cardHTML: card ? card.outerHTML : null,
          grandTag: grand ? grand.tagName : null,
          grandClass: grand ? grand.className : null,
          grandHTML: grand ? grand.outerHTML.slice(0, 3000) : null
        });
      })()
    `,
  });

  const rawVal = evalRes.result?.result?.value || evalRes.result?.value;
  if (rawVal) {
    fs.writeFileSync('.planning/debug/card-q1.json', rawVal);
    console.log('DOM info saved to .planning/debug/card-q1.json');
    const parsed = JSON.parse(rawVal);
    console.log('Card Tag:', parsed.cardTag, 'Class:', parsed.cardClass);
    console.log('Card HTML snippet:', parsed.cardHTML?.slice(0, 500));
  } else {
    console.log('Eval result raw:', JSON.stringify(evalRes));
  }

  ws.close();
  chrome.kill();
}

run().catch(console.error);

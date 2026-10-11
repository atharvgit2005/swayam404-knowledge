import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import WebSocket from 'ws';

const rawCookieEnv = process.env.SWAYAM_COOKIES;
const COOKIES = rawCookieEnv
  ? JSON.parse(rawCookieEnv)
  : [];

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

  console.log('Navigating to course page...');
  await send('Page.enable');
  await send('Page.navigate', {
    url: 'https://onlinecourses.swayam2.ac.in/e-learning/course/ini26_cm22',
  });

  // Wait for rendering
  console.log('Waiting 8s for page to render...');
  await new Promise((r) => setTimeout(r, 8000));

  // Expand all accordions if needed
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        document.querySelectorAll('button[aria-expanded="false"]').forEach(btn => btn.click());
      })()
    `,
  });
  await new Promise((r) => setTimeout(r, 2000));

  // Click on "Quiz: Week 01: Assignment 01" button
  console.log('Clicking on Week 1 Assignment...');
  const clickRes = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const qBtn = btns.find(b => b.textContent.includes('Quiz: Week 01: Assignment 01'));
        if (qBtn) {
          qBtn.click();
          return { clicked: true, text: qBtn.textContent };
        }
        return { clicked: false };
      })()
    `,
  });
  console.log('Click result:', clickRes.result?.result?.value);

  console.log('Waiting 6s for assignment to load...');
  await new Promise((r) => setTimeout(r, 6000));

  // Capture current URL and DOM
  const pageState = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `
      (() => {
        return {
          url: window.location.href,
          title: document.title,
          radiosCount: document.querySelectorAll('input[type="radio"]').length,
          checkboxesCount: document.querySelectorAll('input[type="checkbox"]').length,
          hasAcceptedAnswers: !!document.querySelector('.accepted-answers, .feedback, .qt-accepted-answers, .solution, [class*="accepted"]'),
          bodySnippet: document.body.innerText.slice(0, 1500)
        };
      })()
    `,
  });
  const val = pageState.result?.result?.value;
  console.log('Page state after click:', val);
  fs.writeFileSync('.planning/debug/week1-page-state.json', JSON.stringify(val || {}, null, 2));


  // Also capture screenshot
  const ss = await send('Page.captureScreenshot');
  if (ss.result?.data) {
    fs.writeFileSync('.planning/debug/week1-assignment.png', Buffer.from(ss.result.data, 'base64'));
    console.log('Screenshot saved to .planning/debug/week1-assignment.png');
  }



  ws.close();
  chrome.kill();
}

run().catch(console.error);

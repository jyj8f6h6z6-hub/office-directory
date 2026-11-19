// 讀取 data-source/*.csv → 清理 → AES-256-GCM 加密 → 輸出 docs/data.enc.js
// 用法：
//   DIR_PASSWORD=你的密碼 node tools/build.mjs
//   node tools/build.mjs            （未設環境變數時會詢問密碼）
import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PBKDF2_ITER = 600000;

/* ---------- CSV 解析（支援引號、欄位內換行） ---------- */
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
      } else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c === '\r') { /* skip */ }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/* ---------- 清理 ---------- */
const noSpace = s => s.replace(/[\s　]+/g, '');           // 姓名：移除所有空白（含全形）
const oneLine = s => s.replace(/\r?\n/g, '').replace(/[\s　]+/g, ' ').trim(); // 職稱：換行直接接起來

function load(file, kind) {
  const [head, ...body] = parseCSV(readFileSync(path.join(root, 'data-source', file), 'utf8'));
  const idx = Object.fromEntries(head.map((h, i) => [h.trim(), i]));
  for (const k of ['單位', '子單位', '職稱', '姓名', '分機'])
    if (!(k in idx)) throw new Error(`${file} 缺少欄位：${k}`);

  const out = [];
  let dropped = 0;
  for (const r of body) {
    if (r.every(x => !x.trim())) continue;
    let u = oneLine(r[idx['單位']] ?? '');
    let s = oneLine(r[idx['子單位']] ?? '');
    let t = oneLine(r[idx['職稱']] ?? '');
    let n = noSpace(r[idx['姓名']] ?? '');
    const raw = r[idx['分機']] ?? '';
    // 府內：用 、 , . 分隔多個分機；府外：每行一個號碼
    const p = [...new Set(
      (kind === 'internal' ? raw.split(/[、,，.;；\s]+/) : raw.split(/\r?\n/))
        .map(x => x.trim()).filter(Boolean))];

    if (kind === 'external') {          // 府外：欄位重複時去重（例如 職稱＝子單位）
      if (t === s) t = '';
      if (n === s) n = '';
    }
    if (!n && !t && !p.length) { dropped++; continue; }   // 空白列
    out.push({ u, s, t, n, p });
  }

  // 單位依開頭編號排序（穩定排序，編號相同則維持原順序）
  const order = [];
  for (const r of out) if (!order.includes(r.u)) order.push(r.u);
  const num = u => { const m = u.match(/^\d+/); return m ? parseInt(m[0], 10) : 1e9; };
  const rank = new Map(order.map((u, i) => [u, i]));
  out.sort((a, b) => num(a.u) - num(b.u) || rank.get(a.u) - rank.get(b.u));
  // 子單位維持 CSV 內首次出現順序（sort 為穩定排序，已保留）
  console.log(`${kind}: ${out.length} 筆（略過空白列 ${dropped}）、${new Set(out.map(r => r.u)).size} 個單位`);
  return out;
}

/* ---------- 加密 ---------- */
const b64 = u8 => Buffer.from(u8).toString('base64');

async function encrypt(obj, password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const km = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { v: 1, iter: PBKDF2_ITER, salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}

async function getPassword() {
  if (process.env.DIR_PASSWORD) return process.env.DIR_PASSWORD;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const pw = await rl.question('請輸入網頁密碼（建議 10 碼以上）：');
  rl.close();
  return pw;
}

const password = await getPassword();
if (password.length < 8) { console.error('密碼太短（至少 8 碼，建議 10 碼以上）'); process.exit(1); }

const updated = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
const data = {
  updated,
  internal: load('internal.csv', 'internal'),
  external: load('external.csv', 'external'),
};
const payload = await encrypt(data, password);
writeFileSync(path.join(root, 'docs', 'data.enc.js'),
  `window.ENCRYPTED_DATA = ${JSON.stringify(payload)};\n`);
console.log(`已輸出 docs/data.enc.js（資料日期 ${updated}）`);

// ============================================================
// BoxingFandom — Vercel API Server (GitHub Integration)
// ============================================================

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data', 'boxers');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'boxing2026';
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN;
const REPO_OWNER     = 'weerasakdev-ball';
const REPO_NAME      = 'webboxingfandomver1';
const BRANCH         = 'main';

// === Google OAuth Config ===
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const ADMIN_EMAIL          = process.env.ADMIN_EMAIL;
const SESSION_SECRET       = process.env.SESSION_SECRET;
const REDIRECT_URI         = 'https://webboxingfandomver1.vercel.app/api/auth/callback';

// ── Division Mapping ──
const DIVISION_MAP = {
  'อะตอมเวต':    'Atomweight',
  'สตรอว์เวต':   'Strawweight',
  'มินิฟลาย':    'Mini Flyweight',
  'ฟลายเวต':     'Flyweight',
  'แบนตัมเวต':   'Bantamweight',
  'เฟเธอร์เวต':  'Featherweight',
  'ไลต์เวต':     'Lightweight',
  'เวลเตอร์เวต': 'Welterweight',
  'มิดเดิลเวต':  'Middleweight',
  'ไลต์เฮฟวี่':  'Light Heavyweight',
  'เฮฟวี่เวต':   'Heavyweight',
  'ซูเปอร์เฮฟวี่':'Super Heavyweight',
};

function mapDivision(text) {
  if (!text) return null;
  for (const [th, en] of Object.entries(DIVISION_MAP)) {
    if (text.includes(th)) return en;
  }
  return null;
}

function mapDiscipline(text) {
  if (!text) return 'Muay Thai';
  const t = text.toLowerCase();
  if (t.includes('mma') || t.includes('เอ็มเอ็มเอ')) return 'MMA';
  if (t.includes('ปล้ำ') || t.includes('grappling') || t.includes('submission')) return 'Submission Grappling';
  if (t.includes('คิก') || t.includes('kickboxing')) return 'Kickboxing';
  return 'Muay Thai';
}

function lbsToKg(lbs) {
  return Math.round(lbs * 0.453592 * 100) / 100;
}

// ── normalize ชื่อสำหรับเปรียบเทียบ ──
function norm(str) {
  return (str || '').toLowerCase().replace(/[-\s]/g, '').trim();
}

// ── GitHub helpers ──
async function ghGet(filePath) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`;
  const headers = { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' };
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  return res.json();
}

async function ghPut(filePath, contentStr, commitMessage, sha) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`;
  const headers = { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' };
  const body = { message: commitMessage, content: Buffer.from(contentStr, 'utf-8').toString('base64'), branch: BRANCH };
  if (sha) body.sha = sha;
  const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`GitHub PUT failed: ${await res.text()}`);
  return res.json();
}

// ── Save ไฟล์นักมวยขึ้น GitHub (ดึง SHA ใหม่ทุกครั้งป้องกัน 409) ──
async function saveToGitHub(fileName, contentObj, commitMessage) {
  if (!GITHUB_TOKEN) throw new Error("ยังไม่ได้ใส่ GITHUB_TOKEN");
  const filePath = `data/boxers/${fileName}`;
  const existing = await ghGet(filePath);
  const sha = existing?.sha || null;
  await ghPut(filePath, JSON.stringify(contentObj, null, 2), commitMessage, sha);
  return true;
}

async function deleteFromGitHub(fileName) {
  if (!GITHUB_TOKEN) throw new Error("ยังไม่ได้ใส่ GITHUB_TOKEN");
  const filePath = `data/boxers/${fileName}`;
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`;
  const headers = { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' };
  const existing = await ghGet(filePath);
  if (!existing?.sha) throw new Error("ไม่พบไฟล์ที่จะลบใน GitHub");
  const body = { message: `🗑️ Delete ${fileName} via Admin`, sha: existing.sha, branch: BRANCH };
  const res = await fetch(url, { method: 'DELETE', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error("ลบไฟล์ไม่สำเร็จ");
  return true;
}

async function triggerSniperWorkflow(names) {
  if (!GITHUB_TOKEN) throw new Error("ยังไม่ได้ใส่ GITHUB_TOKEN");
  const listPath = 'update_list.txt';
  const existing = await ghGet(listPath);
  await ghPut(listPath, names.join('\n'), `🎯 Sniper: ${names.join(', ')}`, existing?.sha || null);
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/sniper.yml/dispatches`;
  const headers = { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' };
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ ref: BRANCH }) });
  if (res.status === 404) throw new Error('ไม่พบ workflow file: .github/workflows/sniper.yml');
  if (!res.ok && res.status !== 204) throw new Error(`GitHub Actions trigger failed: ${res.status}`);
  return true;
}

// ── ค้นหาไฟล์นักมวยจากชื่อ ──
// ลำดับการค้นหา:
// 1. ชื่อไฟล์ตรงๆ (แทน space ด้วย -)
// 2. name_th ใน JSON
// 3. name_en ใน JSON
function findFighterFile(name) {
  if (!name) return null;
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && f !== 'fighters-list.json');
  const nameNorm = norm(name);

  // 1. เช็คจากชื่อไฟล์ก่อน (แม่นที่สุด)
  for (const file of files) {
    const fileNorm = norm(file.replace('.json', ''));
    if (fileNorm === nameNorm) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
        return { file, data };
      } catch { continue; }
    }
  }

  // 2. เช็คจาก name_th และ name_en ใน JSON (ต้องตรงพอดีเท่านั้น ห้าม partial match)
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
      const p = data.fighter_profile || {};
      const nameTh = norm(p.name_th || '');
      const nameEn = norm(p.name_en || '');
      if (nameTh === nameNorm || nameEn === nameNorm) {
        return { file, data };
      }
    } catch { continue; }
  }

  // ไม่เจอ = null (จะสร้างไฟล์ใหม่)
  return null;
}

// ── Parse Weigh-in Text ──
function parseWeighinText(text) {
  const results = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let currentEvent = '';
  const matchPattern = /(.+?)\s+ชั่งได้\s+([\d.]+)\s*ป\.?\s*[Vv][Ss]\.?\s*(.+?)\s+ชั่งได้\s+([\d.]+)\s*ป/i;
  const eventKeywords = /ศึก|ONE|รายการ|สรุปผล/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // จับชื่อศึก
    if (eventKeywords.test(line) && !matchPattern.test(line)) {
      currentEvent = line.replace(/^สรุปผลการชั่งน้ำหนักทุกคู่\s*/, '').trim();
      continue;
    }

    const m = line.match(matchPattern);
    if (!m) continue;

    // ตัด prefix เช่น "คู่เอก" "คู่รอง" "*" ออก
    const name1 = m[1].replace(/^(คู่เอก|คู่รอง|คู่สาม|\*+)\s*/g, '').trim();
    const lbs1  = parseFloat(m[2]);
    const name2 = m[3].trim();
    const lbs2  = parseFloat(m[4]);

    // ดึง discipline/division จากวงเล็บในบรรทัดเดียวกัน หรือบรรทัดถัดไป
    let bracketText = '';
    const bracketInLine = line.match(/\(([^)]+)\)/);
    if (bracketInLine) {
      bracketText = bracketInLine[1];
    } else if (i + 1 < lines.length && lines[i + 1].startsWith('(')) {
      bracketText = lines[i + 1];
      i++;
    }

    const discipline = mapDiscipline(bracketText);
    const division   = mapDivision(bracketText);

    results.push({ name: name1, lbs: lbs1, discipline, division, event: currentEvent });
    results.push({ name: name2, lbs: lbs2, discipline, division, event: currentEvent });
  }

  return results;
}

// ── Parse Upcoming Text ──
function parseUpcomingText(text) {
  const results = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let currentEvent = '';
  let currentDate  = '';

  const thaiMonths = { 'ม.ค.':'Jan','ก.พ.':'Feb','มี.ค.':'Mar','เม.ย.':'Apr','พ.ค.':'May','มิ.ย.':'Jun','ก.ค.':'Jul','ส.ค.':'Aug','ก.ย.':'Sep','ต.ค.':'Oct','พ.ย.':'Nov','ธ.ค.':'Dec' };
  const matchPattern = /^(.+?)\s+[Vv][Ss]\.?\s+(.+)$/i;
  const eventKeywords = /ศึก|ONE|รายการ|โปรแกรม/;

  function parseThaiDate(str) {
    for (const [th, en] of Object.entries(thaiMonths)) {
      if (str.includes(th)) {
        const dayMatch  = str.match(/(\d{1,2})\s*[ม-ๆ]/);
        const yearMatch = str.match(/(\d{4})/);
        if (!dayMatch || !yearMatch) return '';
        let year = parseInt(yearMatch[1]);
        if (year > 2500) year -= 543;
        return `${en} ${dayMatch[1].padStart(2,'0')}, ${year}`;
      }
    }
    return '';
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // จับชื่อศึก + วันที่
    if (eventKeywords.test(line) && !matchPattern.test(line)) {
      currentEvent = line.replace(/^โปรแกรมการแข่งขัน\s*/, '').trim();
      const d = parseThaiDate(line);
      if (d) currentDate = d;
      continue;
    }

    const m = line.match(matchPattern);
    if (!m) continue;

    const name1Raw = m[1].replace(/^(คู่เอก|คู่รอง|คู่สาม|\*+)\s*/g, '').trim();
    const rest     = m[2];
    // ตัดวงเล็บออกจากชื่อ 2
    const name2    = rest.replace(/\s*\([^)]+\)\s*$/, '').replace(/\s*\*+\s*$/, '').trim();

    let bracketText = '';
    const bracketInLine = line.match(/\(([^)]+)\)/);
    if (bracketInLine) {
      bracketText = bracketInLine[1];
    } else if (i + 1 < lines.length && lines[i + 1].startsWith('(')) {
      bracketText = lines[i + 1];
      i++;
    }

    results.push({
      name1:      name1Raw,
      name2:      name2,
      discipline: mapDiscipline(bracketText),
      division:   mapDivision(bracketText),
      event:      currentEvent,
      date:       currentDate,
    });
  }

  return results;
}

// ── ROUTER หลักของ Vercel ──
module.exports = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  const json = (data, status = 200) => res.status(status).json(data);
  const isAuthenticated = () => req.cookies && req.cookies.bf_token === 'verified_admin';

  res.setHeader('Access-Control-Allow-Origin', '*');
  if (method === 'OPTIONS') return res.status(200).end();

  // === SECTION 1: Google OAuth ===
  if (method === 'GET' && pathname === '/api/auth/google') {
    const state = Math.random().toString(36).substring(2);
    const params = new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' });
    res.setHeader('Set-Cookie', `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`);
    return res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  }

  if (method === 'GET' && pathname === '/api/auth/callback') {
    const code  = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const cookieState = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith('oauth_state='))?.split('=')[1];
    if (!code || state !== cookieState) return res.redirect(302, '/admin/?error=invalid_state');
    try {
      const tokenRes  = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }) });
      const tokenData = await tokenRes.json();
      const userRes   = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
      const userData  = await userRes.json();
      if (userData.email !== ADMIN_EMAIL) return res.redirect(302, '/admin/?error=unauthorized');
      const expires = new Date(Date.now() + 8 * 60 * 60 * 1000).toUTCString();
      res.setHeader('Set-Cookie', [`bf_token=verified_admin; Path=/; HttpOnly; SameSite=Strict; Expires=${expires}`, `oauth_state=; Path=/; Max-Age=0`]);
      return res.redirect(302, '/admin/dashboard.html');
    } catch (e) { return res.redirect(302, '/admin/?error=oauth_failed'); }
  }

  if (method === 'GET' && pathname === '/api/auth/me') {
    if (isAuthenticated()) return json({ ok: true, email: ADMIN_EMAIL });
    return json({ ok: false }, 401);
  }

  // === SECTION 2: Login ===
  if (method === 'POST' && pathname === '/api/login') {
    const body = req.body;
    if (body.password === ADMIN_PASSWORD) {
      res.setHeader('Set-Cookie', `bf_token=verified_admin; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`);
      return json({ ok: true });
    }
    return json({ ok: false, message: 'รหัสผ่านไม่ถูกต้อง' }, 401);
  }

  if (method === 'POST' && pathname === '/api/logout') {
    res.setHeader('Set-Cookie', 'bf_token=; Path=/; Max-Age=0');
    return json({ ok: true });
  }

  // ── Auth guard ──
  const publicPaths = ['/api/login', '/api/auth/google', '/api/auth/callback', '/api/auth/me'];
  if (pathname.startsWith('/api/') && !publicPaths.includes(pathname) && !isAuthenticated()) {
    return json({ ok: false, message: 'กรุณา login ก่อน' }, 401);
  }

  // === SECTION 3: Sniper Bot ===
  if (method === 'POST' && pathname === '/api/sniper') {
    const body  = req.body;
    const names = (body.names || '').split('\n').map(n => n.trim()).filter(Boolean);
    if (!names.length) return json({ ok: false, message: 'กรุณาระบุชื่อนักมวยอย่างน้อย 1 คน' }, 400);
    try {
      await triggerSniperWorkflow(names);
      return json({ ok: true, message: `🎯 ส่งคำสั่ง Sniper สำเร็จ! ${names.length} คน\n⏳ GitHub Actions กำลังทำงาน ใช้เวลา 2-5 นาที` });
    } catch (e) { return json({ ok: false, message: e.message }, 500); }
  }

  if (method === 'GET' && pathname === '/api/sniper/stream') {
    try {
      const runsUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/sniper.yml/runs?per_page=1&branch=${BRANCH}`;
      const runsRes = await fetch(runsUrl, { headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' } });
      const runsData = await runsRes.json();
      const run = runsData.workflow_runs?.[0];
      if (!run) return json({ ok: false, message: 'ยังไม่มี workflow run' });
      return json({ ok: true, run_id: run.id, status: run.status, conclusion: run.conclusion, started_at: run.run_started_at, html_url: run.html_url, message: run.status === 'completed' ? (run.conclusion === 'success' ? '✅ บอทดึงข้อมูลเสร็จแล้ว!' : `❌ บอทหยุดทำงาน: ${run.conclusion}`) : '⏳ บอทกำลังทำงานอยู่...' });
    } catch (e) { return json({ ok: false, message: e.message }, 500); }
  }

  // === SECTION 4: Parse Weigh-in ===
  if (method === 'POST' && pathname === '/api/parse-weighin') {
    const { text } = req.body;
    if (!text) return json({ ok: false, message: 'กรุณาวางข้อความตราชั่ง' }, 400);

    const parsed = parseWeighinText(text);
    if (!parsed.length) return json({ ok: false, message: 'ไม่พบข้อมูลตราชั่งในข้อความ' }, 400);

    const results = [];
    let saved = 0, created = 0, skipped = 0, failed = 0;
    const totalEvents = new Set(parsed.map(p => p.event)).size;

    for (const entry of parsed) {
      const found = findFighterFile(entry.name);

      if (!found) {
        // สร้างไฟล์ใหม่ด้วยชื่อไฟล์ที่ใช้ - แทน space
        const fileName = entry.name.replace(/\s+/g, '-') + '.json';
        const newData = {
          fighter_profile: {
            name_th: entry.name, name_en: '', alias: 'ไม่ระบุ',
            image_url: entry.name.replace(/\s+/g, '-'), grade: 'N/A',
            physical_stats: { weight_lbs: entry.lbs, weight_kg: lbsToKg(entry.lbs), division: entry.division || 'ยังไม่มีข้อมูล' },
            performance_stats: {}, personal_info: {}, target_urls: [],
          },
          fight_history: [],
          weigh_in_history: [{ event_name: entry.event, weight_lbs: entry.lbs, weight_kg: lbsToKg(entry.lbs), division: entry.division }],
        };
        try {
          await saveToGitHub(fileName, newData, `✨ สร้างนักมวยใหม่: ${entry.name}`);
          created++;
          results.push({ name: entry.name, file: fileName, weight_lbs: entry.lbs, weight_kg: lbsToKg(entry.lbs), division: entry.division, discipline: entry.discipline, event: entry.event, ok: true, is_new: true });
        } catch (e) {
          failed++;
          results.push({ name: entry.name, ok: false, reason: e.message });
        }
        continue;
      }

      // อัปเดตไฟล์เดิม
      const { file, data } = found;
      const p = data.fighter_profile;
      if (!p.physical_stats) p.physical_stats = {};
      if (!data.weigh_in_history) data.weigh_in_history = [];

      // เช็คซ้ำ
      const alreadyLogged = data.weigh_in_history.some(w => w.event_name === entry.event && w.weight_lbs === entry.lbs);
      if (alreadyLogged) {
        skipped++;
        results.push({ name: entry.name, file, weight_lbs: entry.lbs, weight_kg: lbsToKg(entry.lbs), division: entry.division, discipline: entry.discipline, event: entry.event, ok: true, already_logged: true });
        continue;
      }

      // อัปเดตน้ำหนักล่าสุด
      p.physical_stats.weight_lbs = entry.lbs;
      p.physical_stats.weight_kg  = lbsToKg(entry.lbs);

      // อัปเดต division ถ้ายังไม่มี
      let divisionUpdated = null;
      if (entry.division && (!p.physical_stats.division || p.physical_stats.division === 'ยังไม่มีข้อมูล')) {
        p.physical_stats.division = entry.division;
        divisionUpdated = entry.division;
      }

      // เพิ่ม weigh_in_history
      data.weigh_in_history.unshift({ event_name: entry.event, weight_lbs: entry.lbs, weight_kg: lbsToKg(entry.lbs), division: entry.division || p.physical_stats.division });

      try {
        await saveToGitHub(file, data, `⚖️ อัปเดตตราชั่ง ${entry.name}: ${entry.lbs} ป.`);
        saved++;
        results.push({ name: entry.name, file, weight_lbs: entry.lbs, weight_kg: lbsToKg(entry.lbs), division: entry.division, division_updated: divisionUpdated, discipline: entry.discipline, event: entry.event, ok: true });
      } catch (e) {
        failed++;
        results.push({ name: entry.name, file, ok: false, reason: e.message });
      }
    }

    return json({ ok: true, saved, created, skipped, failed, totalEvents, results });
  }

  // === SECTION 5: Parse Upcoming ===
  if (method === 'POST' && pathname === '/api/parse-upcoming') {
    const { text } = req.body;
    if (!text) return json({ ok: false, message: 'กรุณาวางข้อความโปรแกรมการแข่งขัน' }, 400);

    const parsed = parseUpcomingText(text);
    if (!parsed.length) return json({ ok: false, message: 'ไม่พบข้อมูลคู่ชกในข้อความ' }, 400);

    const results = [];
    let saved = 0, created = 0, skipped = 0, failed = 0;
    const totalEvents  = new Set(parsed.map(p => p.event)).size;
    const totalMatches = parsed.length;

    for (const match of parsed) {
      for (const [myName, oppName] of [[match.name1, match.name2], [match.name2, match.name1]]) {
        const found = findFighterFile(myName);

        const upcomingFight = {
          result: '', discipline_en: match.discipline, method_en: '', round: '', time: '',
          opponent_th: oppName, opponent_en: '', opponent_country: 'ยังไม่มีข้อมูล',
          date: match.date, rating: 5, event_en: match.event,
        };

        if (!found) {
          const fileName = myName.replace(/\s+/g, '-') + '.json';
          const newData = {
            fighter_profile: {
              name_th: myName, name_en: '', alias: 'ไม่ระบุ',
              image_url: myName.replace(/\s+/g, '-'), grade: 'N/A',
              physical_stats: { division: match.division || 'ยังไม่มีข้อมูล' },
              performance_stats: {}, personal_info: {}, target_urls: [],
            },
            fight_history: [upcomingFight],
            weigh_in_history: [],
          };
          try {
            await saveToGitHub(fileName, newData, `✨ สร้างนักมวยใหม่: ${myName}`);
            created++;
            results.push({ name: myName, file: fileName, opponent: oppName, discipline: match.discipline, division: match.division, event: match.event, ok: true, is_new: true });
          } catch (e) {
            failed++;
            results.push({ name: myName, ok: false, reason: e.message });
          }
          continue;
        }

        const { file, data } = found;
        if (!data.fight_history) data.fight_history = [];

        // เช็คซ้ำ
        const isDup = data.fight_history.some(f =>
          f.result === '' &&
          (f.opponent_th === oppName || f.opponent_en === oppName) &&
          f.event_en === match.event
        );

        if (isDup) {
          skipped++;
          results.push({ name: myName, file, opponent: oppName, discipline: match.discipline, division: match.division, event: match.event, ok: true, is_dup: true });
          continue;
        }

        data.fight_history.unshift(upcomingFight);

        try {
          await saveToGitHub(file, data, `📅 upcoming: ${myName} vs ${oppName}`);
          saved++;
          results.push({ name: myName, file, opponent: oppName, discipline: match.discipline, division: match.division, event: match.event, ok: true });
        } catch (e) {
          failed++;
          results.push({ name: myName, ok: false, reason: e.message });
        }
      }
    }

    return json({ ok: true, saved, created, skipped, failed, totalEvents, totalMatches, results });
  }

  // === SECTION 6: Fighter APIs ===
  if (method === 'GET' && pathname === '/api/fighters') {
    try {
      const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && f !== 'fighters-list.json');
      const fighters = files.map(file => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
          const p = data.fighter_profile || {};
          const h = data.fight_history || [];
          return { file, name_th: p.name_th || '—', name_en: p.name_en || '—', division: p.physical_stats?.division || '—', grade: p.grade || '—', fights: h.length, wins: h.filter(x => x.result === 'Win').length, losses: h.filter(x => x.result === 'Loss').length };
        } catch { return null; }
      }).filter(Boolean);
      return json({ ok: true, fighters });
    } catch (e) { return json({ ok: false, message: 'อ่านโฟลเดอร์ไม่ได้', error: e.message }); }
  }

  if (method === 'GET' && pathname.startsWith('/api/fighter/')) {
    const file = decodeURIComponent(pathname.replace('/api/fighter/', ''));
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) return json({ ok: false, message: 'ไม่พบไฟล์' }, 404);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return json({ ok: true, data });
  }

  if (method === 'POST' && pathname.startsWith('/api/fighter/')) {
    if (pathname === '/api/fighter/new') {
      const name = (req.body.name_th || '').trim();
      if (!name) return json({ ok: false, message: 'กรุณาระบุชื่อนักมวย' }, 400);
      const fileName = name.replace(/\s+/g, '-') + '.json';
      const template = { fighter_profile: { name_th: name, name_en: '', alias: 'ไม่ระบุ', image_url: name.replace(/\s+/g, '-'), grade: 'N/A', physical_stats: {}, performance_stats: {}, personal_info: {}, target_urls: [] }, fight_history: [], weigh_in_history: [] };
      try {
        await saveToGitHub(fileName, template, `✨ สร้างนักมวยใหม่: ${name}`);
        return json({ ok: true, message: `✅ สร้าง ${fileName} ลง GitHub สำเร็จ` });
      } catch (e) { return json({ ok: false, message: e.message }, 500); }
    } else {
      const file = decodeURIComponent(pathname.replace('/api/fighter/', ''));
      try {
        await saveToGitHub(file, req.body, `📝 อัปเดตข้อมูล: ${file}`);
        return json({ ok: true, message: 'บันทึกลง GitHub สำเร็จ' });
      } catch (e) { return json({ ok: false, message: e.message }, 500); }
    }
  }

  if (method === 'DELETE' && pathname.startsWith('/api/fighter/')) {
    const file = decodeURIComponent(pathname.replace('/api/fighter/', ''));
    try {
      await deleteFromGitHub(file);
      return json({ ok: true, message: 'ลบจาก GitHub เรียบร้อย' });
    } catch (e) { return json({ ok: false, message: e.message }, 500); }
  }

  if (method === 'POST' && pathname.startsWith('/api/run/')) {
    return json({ ok: true, log: '✅ Vercel จะ rebuild อัตโนมัติเมื่อไฟล์บน GitHub เปลี่ยนแปลงครับ' });
  }

  if (method === 'POST' && pathname === '/api/bulk/weight') {
    return json({ ok: false, message: 'อัปเดตแบบกลุ่มกำลังอยู่ระหว่างปรับแต่ง' });
  }

  return json({ ok: false, message: 'ไม่พบ API นี้บน Vercel' }, 404);
};
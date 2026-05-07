// ============================================================
// BoxingFandom — Vercel API Server (GitHub Integration)
// ============================================================

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data', 'boxers');

// ── การตั้งค่า ──
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'boxing2026';
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN;
const REPO_OWNER     = 'weerasakdev-ball';
const REPO_NAME      = 'webboxingfandomver1';
const BRANCH         = 'main';

// === SECTION: Google OAuth Config ===
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const ADMIN_EMAIL          = process.env.ADMIN_EMAIL;
const SESSION_SECRET       = process.env.SESSION_SECRET;
const REDIRECT_URI         = 'https://webboxingfandomver1.vercel.app/api/auth/callback';

// ── ฟังก์ชันตัวช่วยคุยกับ GitHub ──
async function ghGet(filePath) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`;
  const headers = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
  };
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  return res.json();
}

async function ghPut(filePath, contentStr, commitMessage, sha) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`;
  const headers = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
  const body = {
    message: commitMessage,
    content: Buffer.from(contentStr, 'utf-8').toString('base64'),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`GitHub PUT failed: ${await res.text()}`);
  return res.json();
}

async function saveToGitHub(fileName, contentObj, commitMessage) {
  if (!GITHUB_TOKEN) throw new Error("ยังไม่ได้ใส่ GITHUB_TOKEN ในระบบ Vercel");
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

// ── Trigger GitHub Actions Sniper Workflow ──
async function triggerSniperWorkflow(names) {
  if (!GITHUB_TOKEN) throw new Error("ยังไม่ได้ใส่ GITHUB_TOKEN");

  // 1. เขียน update_list.txt ลง GitHub
  const listPath = 'update_list.txt';
  const existing = await ghGet(listPath);
  const sha = existing?.sha || null;
  await ghPut(listPath, names.join('\n'), `🎯 Sniper: ${names.join(', ')}`, sha);

  // 2. Trigger GitHub Actions workflow
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/sniper.yml/dispatches`;
  const headers = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ref: BRANCH }),
  });

  if (res.status === 404) throw new Error('ไม่พบ workflow file: .github/workflows/sniper.yml');
  if (!res.ok && res.status !== 204) throw new Error(`GitHub Actions trigger failed: ${res.status}`);
  return true;
}

// ── ROUTER หลักของ Vercel ──
module.exports = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  const json = (data, status = 200) => res.status(status).json(data);
  const isAuthenticated = () => req.cookies && req.cookies.bf_token === 'verified_admin';

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (method === 'OPTIONS') return res.status(200).end();

  // === SECTION 1: Google OAuth Endpoints ===

  if (method === 'GET' && pathname === '/api/auth/google') {
    const state = Math.random().toString(36).substring(2);
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID, redirect_uri: REDIRECT_URI,
      response_type: 'code', scope: 'openid email profile',
      state, prompt: 'select_account',
    });
    res.setHeader('Set-Cookie', `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`);
    return res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  }

  if (method === 'GET' && pathname === '/api/auth/callback') {
    const code  = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const cookieState = (req.headers.cookie || '').split(';')
      .map(c => c.trim()).find(c => c.startsWith('oauth_state='))
      ?.split('=')[1];
    if (!code || state !== cookieState) return res.redirect(302, '/admin/?error=invalid_state');
    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI, grant_type: 'authorization_code',
        }),
      });
      const tokenData = await tokenRes.json();
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userData = await userRes.json();
      if (userData.email !== ADMIN_EMAIL) return res.redirect(302, '/admin/?error=unauthorized');
      const expires = new Date(Date.now() + 8 * 60 * 60 * 1000).toUTCString();
      res.setHeader('Set-Cookie', [
        `bf_token=verified_admin; Path=/; HttpOnly; SameSite=Strict; Expires=${expires}`,
        `oauth_state=; Path=/; Max-Age=0`,
      ]);
      return res.redirect(302, '/admin/dashboard.html');
    } catch (e) {
      return res.redirect(302, '/admin/?error=oauth_failed');
    }
  }

  if (method === 'GET' && pathname === '/api/auth/me') {
    if (isAuthenticated()) return json({ ok: true, email: ADMIN_EMAIL });
    return json({ ok: false }, 401);
  }

  // === SECTION 2: Legacy Login ===
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

  // POST /api/sniper → เขียน update_list.txt + trigger GitHub Actions
  if (method === 'POST' && pathname === '/api/sniper') {
    const body = req.body;
    const names = (body.names || '')
      .split('\n').map(n => n.trim()).filter(Boolean);
    if (!names.length) return json({ ok: false, message: 'กรุณาระบุชื่อนักมวยอย่างน้อย 1 คน' }, 400);
    try {
      await triggerSniperWorkflow(names);
      return json({
        ok: true,
        message: `🎯 ส่งคำสั่ง Sniper สำเร็จ! ${names.length} คน\n⏳ GitHub Actions กำลังทำงาน ใช้เวลา 2-5 นาที`,
      });
    } catch (e) {
      return json({ ok: false, message: e.message }, 500);
    }
  }

  // GET /api/sniper/stream → เช็คสถานะ GitHub Actions run ล่าสุด
  if (method === 'GET' && pathname === '/api/sniper/stream') {
    try {
      const runsUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/sniper.yml/runs?per_page=1&branch=${BRANCH}`;
      const runsRes = await fetch(runsUrl, {
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });
      const runsData = await runsRes.json();
      const run = runsData.workflow_runs?.[0];
      if (!run) return json({ ok: false, message: 'ยังไม่มี workflow run' });
      return json({
        ok: true,
        run_id:     run.id,
        status:     run.status,
        conclusion: run.conclusion,
        started_at: run.run_started_at,
        html_url:   run.html_url,
        message: run.status === 'completed'
          ? (run.conclusion === 'success' ? '✅ บอทดึงข้อมูลเสร็จแล้ว!' : `❌ บอทหยุดทำงาน: ${run.conclusion}`)
          : '⏳ บอทกำลังทำงานอยู่...',
      });
    } catch (e) {
      return json({ ok: false, message: e.message }, 500);
    }
  }

  // === SECTION 4: Fighter APIs ===

  if (method === 'GET' && pathname === '/api/fighters') {
    try {
      const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && f !== 'fighters-list.json');
      const fighters = files.map(file => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
          const p = data.fighter_profile || {};
          const h = data.fight_history || [];
          return {
            file,
            name_th:  p.name_th || '—',
            name_en:  p.name_en || '—',
            division: p.physical_stats?.division || '—',
            grade:    p.grade || '—',
            fights:   h.length,
            wins:     h.filter(x => x.result === 'Win').length,
            losses:   h.filter(x => x.result === 'Loss').length,
          };
        } catch { return null; }
      }).filter(Boolean);
      return json({ ok: true, fighters });
    } catch (e) {
      return json({ ok: false, message: 'อ่านโฟลเดอร์ไม่ได้', error: e.message });
    }
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
      const template = {
        fighter_profile: { name_th: name, name_en: '', alias: 'ไม่ระบุ', image_url: name.replace(/\s+/g, '-'), grade: 'N/A', physical_stats: {}, performance_stats: {}, personal_info: {}, target_urls: [] },
        fight_history: [], weigh_in_history: [],
      };
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

  // 404
  return json({ ok: false, message: 'ไม่พบ API นี้บน Vercel' }, 404);
};
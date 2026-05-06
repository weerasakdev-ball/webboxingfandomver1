// ============================================================
// BoxingFandom — Vercel API Server (GitHub Integration)
// ============================================================

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data', 'boxers');

// ── การตั้งค่า (ตั้งค่า Environment Variables ใน Vercel) ──
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'boxing2026';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = 'weerasakdev-ball'; // ชื่อเจ้าของ GitHub
const REPO_NAME = 'webboxingfandomver1'; // ชื่อโปรเจกต์
const BRANCH = 'main'; // ชื่อกิ่ง (Branch) ที่ใช้งาน

// ── ฟังก์ชันตัวช่วยคุยกับ GitHub ──
async function saveToGitHub(fileName, contentObj, commitMessage) {
  if (!GITHUB_TOKEN) throw new Error("ยังไม่ได้ใส่ GITHUB_TOKEN ในระบบ Vercel");
  
  const filePath = `data/boxers/${fileName}`;
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`;
  const headers = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };

  // 1. เช็กว่ามีไฟล์เดิมอยู่ไหม (เพื่อเอาค่า SHA มาใช้อัปเดต)
  let sha = null;
  try {
    const getRes = await fetch(url, { headers });
    if (getRes.ok) {
      const data = await getRes.json();
      sha = data.sha;
    }
  } catch (e) {}

  // 2. ส่งข้อมูลใหม่ไปทับ
  const contentBase64 = Buffer.from(JSON.stringify(contentObj, null, 2), 'utf-8').toString('base64');
  const body = {
    message: commitMessage,
    content: contentBase64,
    branch: BRANCH
  };
  if (sha) body.sha = sha;

  const putRes = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (!putRes.ok) {
    const err = await putRes.text();
    throw new Error(`GitHub API Error: ${err}`);
  }
  return true;
}

async function deleteFromGitHub(fileName) {
  if (!GITHUB_TOKEN) throw new Error("ยังไม่ได้ใส่ GITHUB_TOKEN");
  const filePath = `data/boxers/${fileName}`;
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`;
  const headers = { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' };

  let sha = null;
  const getRes = await fetch(url, { headers });
  if (getRes.ok) sha = (await getRes.json()).sha;
  if (!sha) throw new Error("ไม่พบไฟล์ที่จะลบใน GitHub");

  const body = { message: `🗑️ Delete ${fileName} via Admin`, sha, branch: BRANCH };
  const delRes = await fetch(url, { method: 'DELETE', headers, body: JSON.stringify(body) });
  if (!delRes.ok) throw new Error("ลบไฟล์ไม่สำเร็จ");
  return true;
}

// ── ROUTER หลักของ Vercel ──
module.exports = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  // ฟังก์ชันตอบกลับ
  const json = (data, status = 200) => res.status(status).json(data);
  const isAuthenticated = () => req.cookies && req.cookies.bf_token === 'verified_admin'; // ระบบจำลอง Token อย่างง่ายสำหรับ Vercel

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (method === 'OPTIONS') return res.status(200).end();

  // ── API: Login ──
  if (method === 'POST' && pathname === '/api/login') {
    const body = req.body;
    if (body.password === ADMIN_PASSWORD) {
      res.setHeader('Set-Cookie', `bf_token=verified_admin; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`);
      return json({ ok: true });
    }
    return json({ ok: false, message: 'รหัสผ่านไม่ถูกต้อง' }, 401);
  }

  // ── API: Logout ──
  if (method === 'POST' && pathname === '/api/logout') {
    res.setHeader('Set-Cookie', 'bf_token=; Path=/; Max-Age=0');
    return json({ ok: true });
  }

  // ── Auth guard ──
  if (pathname.startsWith('/api/') && !['/api/login'].includes(pathname) && !isAuthenticated()) {
    return json({ ok: false, message: 'กรุณา login ก่อน' }, 401);
  }

  // ── API: GET รายชื่อนักมวยทั้งหมด (อ่านจากไฟล์ที่ Vercel มัดรวมมาให้) ──
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
            name_th: p.name_th || '—',
            name_en: p.name_en || '—',
            division: p.physical_stats?.division || '—',
            grade: p.grade || '—',
            fights: h.length,
            wins: h.filter(x => x.result === 'Win').length,
            losses: h.filter(x => x.result === 'Loss').length,
          };
        } catch { return null; }
      }).filter(Boolean);
      return json({ ok: true, fighters });
    } catch (e) {
      return json({ ok: false, message: 'อ่านโฟลเดอร์ไม่ได้', error: e.message });
    }
  }

  // ── API: GET ข้อมูลนักมวยรายบุคคล ──
  if (method === 'GET' && pathname.startsWith('/api/fighter/')) {
    const file = decodeURIComponent(pathname.replace('/api/fighter/', ''));
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) return json({ ok: false, message: 'ไม่พบไฟล์' }, 404);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return json({ ok: true, data });
  }

  // ── API: SAVE ข้อมูลนักมวย (ส่งเข้า GitHub) ──
  if (method === 'POST' && pathname.startsWith('/api/fighter/')) {
    if (pathname === '/api/fighter/new') {
      // สร้างนักมวยใหม่
      const name = (req.body.name_th || '').trim();
      if (!name) return json({ ok: false, message: 'กรุณาระบุชื่อนักมวย' }, 400);
      const fileName = name.replace(/\s+/g, '-') + '.json';
      
      const template = {
        fighter_profile: { name_th: name, name_en: '', alias: 'ไม่ระบุ', image_url: name.replace(/\s+/g, '-'), grade: 'N/A', physical_stats: {}, performance_stats: {}, personal_info: {}, target_urls: [] },
        fight_history: [], weigh_in_history: []
      };
      
      try {
        await saveToGitHub(fileName, template, `✨ สร้างนักมวยใหม่: ${name}`);
        return json({ ok: true, message: `✅ สร้าง ${fileName} ลง GitHub สำเร็จ (รอ Vercel Build อัตโนมัติ)` });
      } catch (e) { return json({ ok: false, message: e.message }, 500); }
    } else {
      // อัปเดตข้อมูล
      const file = decodeURIComponent(pathname.replace('/api/fighter/', ''));
      try {
        await saveToGitHub(file, req.body, `📝 อัปเดตข้อมูล: ${file}`);
        return json({ ok: true, message: 'บันทึกลง GitHub สำเร็จ (กำลังรีบิลด์หน้าเว็บอัตโนมัติ)' });
      } catch (e) { return json({ ok: false, message: e.message }, 500); }
    }
  }

  // ── API: DELETE นักมวย ──
  if (method === 'DELETE' && pathname.startsWith('/api/fighter/')) {
    const file = decodeURIComponent(pathname.replace('/api/fighter/', ''));
    try {
      await deleteFromGitHub(file);
      return json({ ok: true, message: 'ลบจาก GitHub เรียบร้อย' });
    } catch (e) { return json({ ok: false, message: e.message }, 500); }
  }

  // ── API: ยกเลิกปุ่ม Run Scripts เดิม (Vercel จัดการอัตโนมัติ) ──
  if (method === 'POST' && pathname.startsWith('/api/run/')) {
    return json({ ok: true, log: '✅ บนระบบ Vercel การรันสคริปต์หน้าเว็บจะทำงานอัตโนมัติเมื่อไฟล์บน GitHub ถูกเปลี่ยนแปลงครับ ไม่ต้องกดปุ่มนี้แล้ว' });
  }

  // ── API: Bulk Update และ Parser ต่างๆ (ย่อโค้ดเพื่อส่งเข้า GitHub) ──
  // หมายเหตุ: โค้ด Parser แบบละเอียดสามารถเพิ่มเข้ามาได้ แต่หลักการคือใช้ saveToGitHub(...) แทน fs.writeFileSync(...)
  if (method === 'POST' && pathname === '/api/bulk/weight') {
    return json({ ok: false, message: 'อัปเดตแบบกลุ่มกำลังอยู่ระหว่างปรับแต่งให้รองรับ GitHub API โปรดอัปเดตรายบุคคลไปก่อน' });
  }

  // 404 สำหรับ API
  return json({ ok: false, message: 'ไม่พบ API นี้บน Vercel' }, 404);
};
// ============================================================
// BoxingFandom — Admin Server
// รัน: node server.js
// เปิด: http://localhost:4000/admin
// ============================================================

const http     = require('http');
const fs       = require('fs');
const path     = require('path');
// url module ไม่จำเป็นแล้ว ใช้ WHATWG URL API แทน
const { exec, spawn } = require('child_process');

const PORT     = 4000;
const ROOT     = __dirname;
const DATA_DIR = path.join(ROOT, 'data', 'boxers');

// ── รหัสผ่าน Admin (เปลี่ยนได้เลยครับ) ──
const ADMIN_PASSWORD = 'boxing2026';
const sessions = new Set(); // เก็บ session token อย่างง่าย

// ============================================================
// HELPERS
// ============================================================
function randomToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function getCookie(req, name) {
  const cookies = req.headers.cookie || '';
  const match = cookies.split(';').find(c => c.trim().startsWith(name + '='));
  return match ? match.split('=')[1].trim() : null;
}

function isAuthenticated(req) {
  const token = getCookie(req, 'bf_token');
  return token && sessions.has(token);
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function runScript(scriptName) {
  return new Promise((resolve) => {
    const scriptPath = path.join(ROOT, 'scripts', scriptName);
    if (!fs.existsSync(scriptPath)) {
      return resolve({ ok: false, log: `ไม่พบไฟล์ scripts/${scriptName}` });
    }
    exec(`node "${scriptPath}"`, { cwd: ROOT }, (err, stdout, stderr) => {
      resolve({ ok: !err, log: stdout || stderr || (err ? err.message : 'สำเร็จ') });
    });
  });
}

// ============================================================
// ROUTER
// ============================================================
const server = http.createServer(async (req, res) => {
  const parsed   = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsed.pathname;
  const method   = req.method;

  // CORS สำหรับ dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // ── Serve static files (admin UI + assets) ──
  if (method === 'GET' && !pathname.startsWith('/api/')) {
    let filePath = '';

    // root → login
    if (pathname === '/') {
      res.writeHead(302, { 'Location': '/admin/' });
      return res.end();
    }

    if (pathname === '/admin' || pathname === '/admin/') {
      filePath = path.join(ROOT, 'admin', 'index.html');
    }
    // /admin/xxx → admin/xxx
    else if (pathname.startsWith('/admin/')) {
      const sub = pathname.slice('/admin/'.length); // เช่น "dashboard.html" หรือ "_shared.js"
      filePath = path.join(ROOT, 'admin', sub);
    }
    // ไฟล์อื่นๆ (assets, data, pages)
    else {
      filePath = path.join(ROOT, pathname.slice(1));
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const types = { '.html':'text/html', '.css':'text/css', '.js':'application/javascript', '.json':'application/json', '.jpg':'image/jpeg', '.png':'image/png', '.webp':'image/webp' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain; charset=utf-8' });
      return fs.createReadStream(filePath).pipe(res);
    }

    // ไม่เจอไฟล์ → 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end(`404 — ไม่พบ: ${pathname}`);
  }

  // ── API: Login ──
  if (method === 'POST' && pathname === '/api/login') {
    const body = await parseBody(req);
    if (body.password === ADMIN_PASSWORD) {
      const token = randomToken();
      sessions.add(token);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `bf_token=${token}; Path=/; HttpOnly; SameSite=Strict`
      });
      return res.end(JSON.stringify({ ok: true }));
    }
    return json(res, { ok: false, message: 'รหัสผ่านไม่ถูกต้อง' }, 401);
  }

  // ── API: Logout ──
  if (method === 'POST' && pathname === '/api/logout') {
    const token = getCookie(req, 'bf_token');
    if (token) sessions.delete(token);
    res.writeHead(200, { 'Set-Cookie': 'bf_token=; Path=/; Max-Age=0' });
    return res.end(JSON.stringify({ ok: true }));
  }

  // ── Auth guard ── ทุก API ด้านล่างต้อง login ก่อน
  if (pathname.startsWith('/api/') && !isAuthenticated(req)) {
    return json(res, { ok: false, message: 'กรุณา login ก่อน' }, 401);
  }

  // ── API: GET รายชื่อนักมวยทั้งหมด ──
  if (method === 'GET' && pathname === '/api/fighters') {
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && f !== 'fighters-list.json');
    const fighters = files.map(file => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
        const p = data.fighter_profile || {};
        const h = data.fight_history || [];
        return {
          file,
          name_th:  p.name_th  || '—',
          name_en:  p.name_en  || '—',
          division: p.physical_stats?.division || '—',
          grade:    p.grade    || '—',
          fights:   h.length,
          wins:     h.filter(x => x.result === 'Win').length,
          losses:   h.filter(x => x.result === 'Loss').length,
        };
      } catch { return null; }
    }).filter(Boolean);
    return json(res, { ok: true, fighters });
  }

  // ── API: GET ข้อมูลนักมวยรายบุคคล ──
  if (method === 'GET' && pathname.startsWith('/api/fighter/')) {
    const file = decodeURIComponent(pathname.replace('/api/fighter/', ''));
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) return json(res, { ok: false, message: 'ไม่พบไฟล์' }, 404);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return json(res, { ok: true, data });
    } catch (e) {
      return json(res, { ok: false, message: 'JSON พัง: ' + e.message }, 500);
    }
  }

  // ── API: SAVE ข้อมูลนักมวย ──
  if (method === 'POST' && pathname.startsWith('/api/fighter/')) {
    const file = decodeURIComponent(pathname.replace('/api/fighter/', ''));
    const filePath = path.join(DATA_DIR, file);
    const body = await parseBody(req);
    try {
      fs.writeFileSync(filePath, JSON.stringify(body, null, 2), 'utf-8');
      return json(res, { ok: true, message: 'บันทึกสำเร็จ' });
    } catch (e) {
      return json(res, { ok: false, message: e.message }, 500);
    }
  }

  // ── API: DELETE นักมวย ──
  if (method === 'DELETE' && pathname.startsWith('/api/fighter/')) {
    const file = decodeURIComponent(pathname.replace('/api/fighter/', ''));
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) return json(res, { ok: false, message: 'ไม่พบไฟล์' }, 404);
    fs.unlinkSync(filePath);
    return json(res, { ok: true, message: 'ลบเรียบร้อย' });
  }

  // ── API: รัน generate-list.js ──
  if (method === 'POST' && pathname === '/api/run/generate-list') {
    const result = await runScript('generate-list.js');
    return json(res, result);
  }

  // ── API: รัน generate-fighters.js ──
  if (method === 'POST' && pathname === '/api/run/generate-fighters') {
    const result = await runScript('generate-fighters.js');
    return json(res, result);
  }

  // ── API: รัน scraper bot ──
  if (method === 'POST' && pathname === '/api/run/scraper') {
    const result = await runScript('scraper-bot.js');
    return json(res, result);
  }

  // ── API: Bulk update น้ำหนัก ──
  if (method === 'POST' && pathname === '/api/bulk/weight') {
    const body = await parseBody(req);
    // body = [{ file, weight_kg, weight_lbs, division }, ...]
    const results = [];
    for (const item of body) {
      try {
        const filePath = path.join(DATA_DIR, item.file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (!data.fighter_profile.physical_stats) data.fighter_profile.physical_stats = {};
        if (item.weight_kg)  data.fighter_profile.physical_stats.weight_kg  = item.weight_kg;
        if (item.weight_lbs) data.fighter_profile.physical_stats.weight_lbs = item.weight_lbs;
        if (item.division)   data.fighter_profile.physical_stats.division   = item.division;
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        results.push({ file: item.file, ok: true });
      } catch (e) {
        results.push({ file: item.file, ok: false, error: e.message });
      }
    }
    return json(res, { ok: true, results });
  }

  // ── API: Smart Weigh-in Parser ──
  if (method === 'POST' && pathname === '/api/parse-weighin') {
    const body = await parseBody(req);
    const { text } = body;
    if (!text) return json(res, { ok: false, message: 'กรุณาวางข้อความตราชั่ง' }, 400);

    function mapDivision(str) {
      if (!str) return null;
      const m = {'อะตอมเวต':'Atomweight','สตรอว์เวต':'Strawweight','ฟลายเวต':'Flyweight',
        'แบนตัมเวต':'Bantamweight','เฟเธอร์เวต':'Featherweight','ไลต์เวต':'Lightweight',
        'เวลเตอร์เวต':'Welterweight','มิดเดิลเวต':'Middleweight',
        'ไลต์เฮฟวีเวต':'Light Heavyweight','เฮฟวีเวต':'Heavyweight'};
      for (const [th, en] of Object.entries(m)) { if (str.includes(th)) return en; }
      return null;
    }
    function mapDiscipline(str) {
      if (!str) return 'Muay Thai';
      if (str.includes('คิกบ็อกซิ่ง')||str.includes('คิกบ็อกซิง')) return 'Kickboxing';
      if (str.toUpperCase().includes('MMA')) return 'MMA';
      return 'Muay Thai';
    }
    function cleanName(n) {
      return n.replace(/[\u200b-\u200d\uFEFF]/g,'').replace(/\xa0/g,' ')
        .replace(/\s*\(.*?\)\s*/g,'').replace(/คู่เอก|คู่รอง|\*/g,'')
        .replace(/\s+/g,' ').trim();
    }
    const thMonthMap = {'ม.ค.':'Jan','ก.พ.':'Feb','มี.ค.':'Mar','เม.ย.':'Apr','พ.ค.':'May',
      'มิ.ย.':'Jun','ก.ค.':'Jul','ส.ค.':'Aug','ก.ย.':'Sep','ต.ค.':'Oct','พ.ย.':'Nov','ธ.ค.':'Dec'};
    function parseThDate(str) {
      const m = str.match(/(\d{1,2})\s+(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s+(\d{2,4})/);
      if (!m) return null;
      const day = m[1].padStart(2,'0');
      const mon = thMonthMap[m[2]];
      let yr = parseInt(m[3]);
      if (yr < 100) yr = yr > 60 ? yr+1900 : yr+2000;
      if (yr > 2500) yr -= 543;
      return `${mon} ${day}, ${yr}`;
    }

    // โหลด fighters index
    const allFiles = fs.readdirSync(DATA_DIR).filter(f=>f.endsWith('.json')&&f!=='fighters-list.json');
    const fighterIndex = [];
    for (const file of allFiles) {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(DATA_DIR,file),'utf-8'));
        fighterIndex.push({
          file,
          name_clean: (d.fighter_profile?.name_th||'').replace(/\s+/g,'').toLowerCase()
        });
      } catch {}
    }
    function findFile(name) {
      const s = name.replace(/\s+/g,'').toLowerCase();
      const exact = fighterIndex.find(f=>f.name_clean===s);
      if (exact) return exact.file;
      const first = name.split(' ')[0].toLowerCase();
      const byFirst = fighterIndex.filter(f=>f.name_clean.startsWith(first));
      if (byFirst.length===1) return byFirst[0].file;
      const contains = fighterIndex.find(f=>f.name_clean.includes(s)||s.includes(f.name_clean));
      return contains ? contains.file : null;
    }

    // Parse ข้อความ
    const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);
    const blocks = [];
    let cur = null, pendingDiv = null, pendingDisc = null;

    for (const line of lines) {
      // บรรทัดชื่อศึก
      const isEvent = line.includes('สรุปผลการชั่ง') ||
        (line.match(/^(ศึก\s+|ONE\s+|The\s+)/i) && !line.includes('ชั่งได้'));
      if (isEvent) {
        if (cur && cur.fighters.length>0) blocks.push(cur);
        let evName = line.replace(/สรุปผลการชั่งน้ำหนักทุกคู่/g,'').replace(/^ศึก\s*/,'').trim();
        const evDate = parseThDate(line);
        cur = { event_name: evName, event_date: evDate, fighters: [] };
        pendingDiv = null; pendingDisc = null;
        continue;
      }
      // บรรทัดรุ่น (วงเล็บ)
      const divMatch = line.match(/\((.*?รุ่น.*?)\)/);
      if (divMatch && !line.includes('ชั่งได้')) {
        pendingDiv  = mapDivision(divMatch[1]);
        pendingDisc = mapDiscipline(divMatch[1]);
        continue;
      }
      // บรรทัดชั่งน้ำหนัก
      if (line.includes('ชั่งได้')) {
        if (!cur) { cur = { event_name: 'ไม่ระบุศึก', event_date: null, fighters: [] }; }
        // ตรวจรุ่นในบรรทัดเดียวกัน
        const inlineDiv = line.match(/\((.*?รุ่น.*?)\)/);
        if (inlineDiv) { pendingDiv=mapDivision(inlineDiv[1]); pendingDisc=mapDiscipline(inlineDiv[1]); }
        // แยก vs
        const parts = line.split(/\s+vs\.?\s+|\s+VS\.?\s+/i);
        for (const part of parts) {
          const wm = part.match(/(.+?)\s+ชั่งได้\s+([\d.]+)\s+ป/);
          if (wm) {
            const name = cleanName(wm[1]);
            const wlbs = parseFloat(wm[2]);
            if (name && wlbs) {
              cur.fighters.push({
                name, weight_lbs: wlbs,
                weight_kg: Math.round(wlbs*0.453592*10)/10,
                division: pendingDiv, discipline: pendingDisc||'Muay Thai'
              });
            }
          }
        }
        pendingDiv = null; pendingDisc = null;
      }
    }
    if (cur && cur.fighters.length>0) blocks.push(cur);

    // บันทึกลง JSON
    const results = [];
    for (const block of blocks) {
      for (const fighter of block.fighters) {
        let file = findFile(fighter.name);
        let isNewFile = false;

        // ── ไม่พบไฟล์ → สร้างใหม่อัตโนมัติ ──
        if (!file) {
          const fileName = fighter.name.replace(/\s+/g, '-') + '.json';
          const newPath  = path.join(DATA_DIR, fileName);
          const template = {
            fighter_profile: {
              name_th: fighter.name,
              name_en: '',
              alias: 'ไม่ระบุ',
              image_url: fighter.name.replace(/\s+/g, '-'),
              grade: 'N/A',
              fighting_style_th: 'ยังไม่มีข้อมูล',
              fighting_style_en: 'ยังไม่มีข้อมูล',
              stance: 'ยังไม่มีข้อมูล',
              physical_stats: {
                weight_lbs: fighter.weight_lbs,
                weight_kg:  fighter.weight_kg,
                division:   fighter.division || 'ยังไม่มีข้อมูล',
                height_ft: '', height_cm: 0, reach_cm: '', leg_reach_cm: ''
              },
              performance_stats: {
                significant_strikes_per_minute: { head:'ยังไม่มีข้อมูล', body:'ยังไม่มีข้อมูล', legs:'ยังไม่มีข้อมูล', total_per_minute:'ยังไม่มีข้อมูล' },
                significant_strike_accuracy: { overall_accuracy_percentage:'ยังไม่มีข้อมูล', accuracy_by_target_percentage:{ head:'ยังไม่มีข้อมูล', body:'ยังไม่มีข้อมูล', legs:'ยังไม่มีข้อมูล' } },
                defensive_stats: { overall_defense_percentage:'ยังไม่มีข้อมูล', defense_by_target_percentage:{ head:'ยังไม่มีข้อมูล', body:'ยังไม่มีข้อมูล', legs:'ยังไม่มีข้อมูล' } }
              },
              personal_info: { country_th:'ยังไม่มีข้อมูล', country_en:'ยังไม่มีข้อมูล', age:0, team_th:'ยังไม่มีข้อมูล', team_en:'ยังไม่มีข้อมูล' },
              target_urls: []
            },
            fight_history: [],
            weigh_in_history: [{
              event_name: block.event_name,
              event_date: block.event_date || null,
              weight_lbs: fighter.weight_lbs,
              weight_kg:  fighter.weight_kg,
              division:   fighter.division || null,
              discipline: fighter.discipline
            }]
          };
          try {
            fs.writeFileSync(newPath, JSON.stringify(template, null, 2), 'utf-8');
            file = fileName;
            isNewFile = true;
            // เพิ่มเข้า index เผื่อมีชื่อซ้ำในรายการเดียวกัน
            fighterIndex.push({ file: fileName, name_clean: fighter.name.replace(/\s+/g,'').toLowerCase() });
          } catch(e) {
            results.push({ name:fighter.name, ok:false, reason:'สร้างไฟล์ไม่ได้: '+e.message, event:block.event_name });
            continue;
          }
          results.push({ name:fighter.name, file, ok:true, is_new:true,
            weight_lbs:fighter.weight_lbs, weight_kg:fighter.weight_kg,
            division_updated: fighter.division || null,
            event:block.event_name, already_logged:false });
          continue;
        }
        try {
          const fp = path.join(DATA_DIR, file);
          const data = JSON.parse(fs.readFileSync(fp,'utf-8'));
          const p = data.fighter_profile;
          if (!p.physical_stats) p.physical_stats = {};
          if (!data.weigh_in_history) data.weigh_in_history = [];

          // อัปเดต weight เสมอ
          p.physical_stats.weight_lbs = fighter.weight_lbs;
          p.physical_stats.weight_kg  = fighter.weight_kg;

          // รุ่น: ใส่เฉพาะถ้ายังไม่มี
          const hasDivision = p.physical_stats.division &&
            p.physical_stats.division !== 'ยังไม่มีข้อมูล' && p.physical_stats.division !== '';
          const divUpdated = !hasDivision && fighter.division;
          if (divUpdated) p.physical_stats.division = fighter.division;

          // เพิ่มใน weigh_in_history (ไม่ซ้ำ event เดิม)
          const alreadyLogged = data.weigh_in_history.some(h=>h.event_name===block.event_name);
          if (!alreadyLogged) {
            data.weigh_in_history.unshift({
              event_name: block.event_name,
              event_date: block.event_date || null,
              weight_lbs: fighter.weight_lbs,
              weight_kg:  fighter.weight_kg,
              division:   fighter.division || p.physical_stats.division || null,
              discipline: fighter.discipline
            });
          }

          fs.writeFileSync(fp, JSON.stringify(data,null,2),'utf-8');
          results.push({ name:fighter.name, file, ok:true,
            weight_lbs:fighter.weight_lbs, weight_kg:fighter.weight_kg,
            division_updated: divUpdated ? fighter.division : null,
            event:block.event_name, already_logged:alreadyLogged });
        } catch(e) {
          results.push({ name:fighter.name, ok:false, reason:e.message, event:block.event_name });
        }
      }
    }

    const saved    = results.filter(r=>r.ok&&!r.already_logged&&!r.is_new).length;
    const created  = results.filter(r=>r.ok&&r.is_new).length;
    const skipped  = results.filter(r=>r.ok&&r.already_logged).length;
    const failed   = results.filter(r=>!r.ok).length;
    return json(res, { ok:true, results, saved, created, skipped, failed, totalEvents:blocks.length });
  }

  // ── API: Upcoming Fight Parser ──
  if (method === 'POST' && pathname === '/api/parse-upcoming') {
    const body = await parseBody(req);
    const { text } = body;
    if (!text) return json(res, { ok:false, message:'กรุณาวางข้อความโปรแกรมการแข่งขัน' }, 400);

    // ── shared helpers ──
    function divisionMap(str) {
      if (!str) return 'ยังไม่มีข้อมูล';
      const m = {
        'อะตอมเวต':'Atomweight','สตรอว์เวต':'Strawweight','ฟลายเวต':'Flyweight',
        'แบนตัมเวต':'Bantamweight','เฟเธอร์เวต':'Featherweight','ไลต์เวต':'Lightweight',
        'เวลเตอร์เวต':'Welterweight','มิดเดิลเวต':'Middleweight',
        'ไลต์เฮฟวีเวต':'Light Heavyweight','เฮฟวีเวต':'Heavyweight'
      };
      for (const [th,en] of Object.entries(m)) { if (str.includes(th)) return en; }
      return 'ยังไม่มีข้อมูล';
    }
    function disciplineMap(str) {
      if (!str) return 'Muay Thai';
      if (str.includes('คิกบ็อกซิ่ง')||str.includes('คิกบ็อกซิง')) return 'Kickboxing';
      if (str.toUpperCase().includes('MMA')||str.includes('ผสมผสาน')||str.includes('ต่อสู้แบบผสม')) return 'MMA';
      if (str.includes('ปล้ำ')||str.includes('จับล็อก')) return 'Submission Grappling';
      return 'Muay Thai';
    }
    function cleanN(n) {
      return n.replace(/[\u200b-\u200d\uFEFF]/g,'').replace(/\xa0/g,' ')
        .replace(/\s*\(.*?\)\s*/g,'').replace(/คู่เอก|คู่รอง|\*/g,'')
        .replace(/\s+/g,' ').trim();
    }
    const thMonths2 = {'ม.ค.':'Jan','ก.พ.':'Feb','มี.ค.':'Mar','เม.ย.':'Apr','พ.ค.':'May',
      'มิ.ย.':'Jun','ก.ค.':'Jul','ส.ค.':'Aug','ก.ย.':'Sep','ต.ค.':'Oct','พ.ย.':'Nov','ธ.ค.':'Dec'};
    function parseDate(str) {
      const m = str.match(/(\d{1,2})\s+(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s+(\d{2,4})/);
      if (!m) return null;
      let yr = parseInt(m[3]);
      if (yr < 100) yr = yr > 60 ? yr+1900 : yr+2000;
      if (yr > 2500) yr -= 543;
      return `${thMonths2[m[2]]} ${m[1].padStart(2,'0')}, ${yr}`;
    }

    // โหลด fighter index
    const allFiles2 = fs.readdirSync(DATA_DIR).filter(f=>f.endsWith('.json')&&f!=='fighters-list.json');
    const idx2 = [];
    for (const file of allFiles2) {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(DATA_DIR,file),'utf-8'));
        idx2.push({ file, name_clean:(d.fighter_profile?.name_th||'').replace(/\s+/g,'').toLowerCase() });
      } catch {}
    }
    function findF(name) {
      const s = name.replace(/\s+/g,'').toLowerCase();
      const exact = idx2.find(f=>f.name_clean===s);
      if (exact) return exact.file;
      const first = name.split(' ')[0].toLowerCase();
      const byFirst = idx2.filter(f=>f.name_clean.startsWith(first));
      if (byFirst.length===1) return byFirst[0].file;
      const contains = idx2.find(f=>f.name_clean.includes(s)||s.includes(f.name_clean));
      return contains ? contains.file : null;
    }

    // ── Parse ข้อความ ──
    const lines2 = text.split('\n').map(l=>l.trim()).filter(Boolean);
    const blocks2 = [];
    let cur2 = null, pendDiv = null, pendDisc = null;

    for (const line of lines2) {
      // บรรทัดชื่อศึก
      const isEv = line.includes('โปรแกรมการแข่งขัน') || line.includes('โปรแกรม') ||
        (line.match(/^ศึก\s+/i) && !line.includes('vs'));
      if (isEv) {
        if (cur2 && cur2.matches.length>0) blocks2.push(cur2);
        let evName = line.replace(/โปรแกรมการแข่งขัน(ศึก)?/g,'').replace(/^ศึก\s*/,'').trim();
        const evDate = parseDate(line);
        cur2 = { event_name: evName, event_date: evDate, matches: [] };
        pendDiv = null; pendDisc = null;
        continue;
      }

      // บรรทัดรุ่น/กติกาในวงเล็บ (ไม่มี vs)
      const divMatch2 = line.match(/^\((.*?รุ่น.*?)\)$/);
      if (divMatch2) {
        pendDiv  = divisionMap(divMatch2[1]);
        pendDisc = disciplineMap(divMatch2[1]);
        // ใส่ให้ match ล่าสุด
        if (cur2 && cur2.matches.length>0) {
          const last = cur2.matches[cur2.matches.length-1];
          last.division   = pendDiv;
          last.discipline = pendDisc;
        }
        pendDiv = null; pendDisc = null;
        continue;
      }

      // บรรทัด vs
      if (line.includes(' vs ') || line.includes(' VS ') || line.includes(' Vs ')) {
        if (!cur2) { cur2 = { event_name:'ไม่ระบุศึก', event_date:null, matches:[] }; }

        // ตรวจรุ่นในวงเล็บท้ายบรรทัด
        let divInline = null, discInline = null;
        const inlineBracket = line.match(/\((.*?รุ่น.*?)\)/);
        if (inlineBracket) {
          divInline  = divisionMap(inlineBracket[1]);
          discInline = disciplineMap(inlineBracket[1]);
        }

        const cleanLine = line.replace(/\(.*?\)/g,'').replace(/คู่เอก|คู่รอง/g,'').trim();
        const vsParts   = cleanLine.split(/\s+vs\.?\s+|\s+VS\.?\s+|\s+Vs\.?\s+/i);
        if (vsParts.length >= 2) {
          const nameA = cleanN(vsParts[0]);
          const nameB = cleanN(vsParts[1]);
          if (nameA && nameB) {
            cur2.matches.push({
              nameA, nameB,
              division:   divInline   || pendDiv  || 'ยังไม่มีข้อมูล',
              discipline: discInline  || pendDisc || 'Muay Thai'
            });
            pendDiv = null; pendDisc = null;
          }
        }
        continue;
      }
    }
    if (cur2 && cur2.matches.length>0) blocks2.push(cur2);

    // ── สร้าง template นักมวยใหม่ ──
    function newFighterTemplate(name, division, discipline) {
      return {
        fighter_profile: {
          name_th: name, name_en: '', alias: 'ไม่ระบุ',
          image_url: name.replace(/\s+/g,'-'),
          grade: 'N/A', fighting_style_th:'ยังไม่มีข้อมูล', fighting_style_en:'ยังไม่มีข้อมูล', stance:'ยังไม่มีข้อมูล',
          physical_stats: { weight_lbs:'', weight_kg:'', division, height_ft:'', height_cm:0, reach_cm:'', leg_reach_cm:'' },
          performance_stats: {
            significant_strikes_per_minute:{head:'ยังไม่มีข้อมูล',body:'ยังไม่มีข้อมูล',legs:'ยังไม่มีข้อมูล',total_per_minute:'ยังไม่มีข้อมูล'},
            significant_strike_accuracy:{overall_accuracy_percentage:'ยังไม่มีข้อมูล',accuracy_by_target_percentage:{head:'ยังไม่มีข้อมูล',body:'ยังไม่มีข้อมูล',legs:'ยังไม่มีข้อมูล'}},
            defensive_stats:{overall_defense_percentage:'ยังไม่มีข้อมูล',defense_by_target_percentage:{head:'ยังไม่มีข้อมูล',body:'ยังไม่มีข้อมูล',legs:'ยังไม่มีข้อมูล'}}
          },
          personal_info:{country_th:'ยังไม่มีข้อมูล',country_en:'ยังไม่มีข้อมูล',age:0,team_th:'ยังไม่มีข้อมูล',team_en:'ยังไม่มีข้อมูล'},
          target_urls:[]
        },
        fight_history: [],
        weigh_in_history: []
      };
    }

    // ── บันทึกลง JSON ──
    const results2 = [];

    function processFighter(name, opponentName, block, division, discipline) {
      let file = findF(name);
      let isNew = false;

      // สร้างใหม่ถ้าไม่มี
      if (!file) {
        const fileName = name.replace(/\s+/g,'-') + '.json';
        const fp = path.join(DATA_DIR, fileName);
        const tmpl = newFighterTemplate(name, division, discipline);
        try {
          fs.writeFileSync(fp, JSON.stringify(tmpl,null,2), 'utf-8');
          file = fileName; isNew = true;
          idx2.push({ file:fileName, name_clean:name.replace(/\s+/g,'').toLowerCase() });
        } catch(e) {
          results2.push({ name, ok:false, reason:'สร้างไฟล์ไม่ได้: '+e.message, event:block.event_name });
          return;
        }
      }

      try {
        const fp = path.join(DATA_DIR, file);
        const data = JSON.parse(fs.readFileSync(fp,'utf-8'));
        if (!data.fight_history) data.fight_history = [];

        // เช็คซ้ำ: คู่เดิม + ศึกเดิม
        const isDup = data.fight_history.some(h =>
          h.event_en === block.event_name &&
          (h.opponent_th === opponentName || h.opponent_en === opponentName)
        );

        if (!isDup) {
          data.fight_history.unshift({
            result:        '',           // ว่าง = upcoming
            discipline_en: discipline,
            method_en:     '',
            round:         '',
            time:          '',
            opponent_th:   opponentName,
            opponent_en:   '',
            opponent_country: 'ยังไม่มีข้อมูล',
            date:          block.event_date || '',
            rating:        5,
            event_en:      block.event_name
          });
          // อัปเดต division ถ้ายังไม่มี
          const p = data.fighter_profile;
          if (!p.physical_stats) p.physical_stats = {};
          const hasDiv = p.physical_stats.division && p.physical_stats.division !== 'ยังไม่มีข้อมูล';
          if (!hasDiv && division !== 'ยังไม่มีข้อมูล') p.physical_stats.division = division;
          fs.writeFileSync(fp, JSON.stringify(data,null,2), 'utf-8');
        }

        results2.push({ name, file, ok:true, is_new:isNew, is_dup:isDup,
          opponent:opponentName, division, discipline, event:block.event_name });
      } catch(e) {
        results2.push({ name, ok:false, reason:e.message, event:block.event_name });
      }
    }

    for (const block of blocks2) {
      for (const match of block.matches) {
        processFighter(match.nameA, match.nameB, block, match.division, match.discipline);
        processFighter(match.nameB, match.nameA, block, match.division, match.discipline);
      }
    }

    const saved2   = results2.filter(r=>r.ok&&!r.is_dup&&!r.is_new).length;
    const created2 = results2.filter(r=>r.ok&&r.is_new).length;
    const skipped2 = results2.filter(r=>r.ok&&r.is_dup).length;
    const failed2  = results2.filter(r=>!r.ok).length;
    const matches2 = blocks2.reduce((s,b)=>s+b.matches.length, 0);

    return json(res, { ok:true, results:results2, saved:saved2, created:created2,
      skipped:skipped2, failed:failed2, totalMatches:matches2, totalEvents:blocks2.length });
  }
  if (method === 'POST' && pathname === '/api/bulk/fight') {
    const body = await parseBody(req);
    // body = [{ file, fight: {...} }, ...]
    const results = [];
    for (const item of body) {
      try {
        const filePath = path.join(DATA_DIR, item.file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (!data.fight_history) data.fight_history = [];
        data.fight_history.unshift(item.fight); // เพิ่มไว้บนสุด (ล่าสุด)
        data.fight_history.sort((a, b) => new Date(b.date) - new Date(a.date));
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        results.push({ file: item.file, ok: true });
      } catch (e) {
        results.push({ file: item.file, ok: false, error: e.message });
      }
    }
    return json(res, { ok: true, results });
  }

  // ── API: สร้างนักมวยใหม่จากชื่อ ──
  if (method === 'POST' && pathname === '/api/fighter/new') {
    const body = await parseBody(req);
    const name = (body.name_th || '').trim();
    if (!name) return json(res, { ok: false, message: 'กรุณาระบุชื่อนักมวย' }, 400);
    const fileName = name.replace(/\s+/g, '-') + '.json';
    const filePath = path.join(DATA_DIR, fileName);
    if (fs.existsSync(filePath)) return json(res, { ok: false, message: `มีไฟล์ ${fileName} อยู่แล้ว` }, 409);
    const template = {
      fighter_profile: {
        name_th: name, name_en: '', alias: 'ไม่ระบุ',
        image_url: name.replace(/\s+/g, '-'),
        grade: 'N/A', fighting_style_th: 'ยังไม่มีข้อมูล', fighting_style_en: 'ยังไม่มีข้อมูล', stance: 'ยังไม่มีข้อมูล',
        physical_stats: { weight_lbs: '', weight_kg: '', division: 'ยังไม่มีข้อมูล', height_ft: '', height_cm: 0, reach_cm: '', leg_reach_cm: '' },
        performance_stats: {
          significant_strikes_per_minute: { head: 'ยังไม่มีข้อมูล', body: 'ยังไม่มีข้อมูล', legs: 'ยังไม่มีข้อมูล', total_per_minute: 'ยังไม่มีข้อมูล' },
          significant_strike_accuracy: { overall_accuracy_percentage: 'ยังไม่มีข้อมูล', accuracy_by_target_percentage: { head: 'ยังไม่มีข้อมูล', body: 'ยังไม่มีข้อมูล', legs: 'ยังไม่มีข้อมูล' } },
          defensive_stats: { overall_defense_percentage: 'ยังไม่มีข้อมูล', defense_by_target_percentage: { head: 'ยังไม่มีข้อมูล', body: 'ยังไม่มีข้อมูล', legs: 'ยังไม่มีข้อมูล' } }
        },
        personal_info: { country_th: 'ยังไม่มีข้อมูล', country_en: 'ยังไม่มีข้อมูล', age: 0, team_th: 'ยังไม่มีข้อมูล', team_en: 'ยังไม่มีข้อมูล' },
        target_urls: []
      },
      fight_history: [],
      weigh_in_history: []
    };
    fs.writeFileSync(filePath, JSON.stringify(template, null, 2), 'utf-8');

    // auto-run generate-list + generate-fighters หลังสร้างนักมวยใหม่
    const genList     = path.join(ROOT, 'scripts', 'generate-list.js');
    const genFighters = path.join(ROOT, 'scripts', 'generate-fighters.js');
    if (fs.existsSync(genList))     exec(`node "${genList}"`,     { cwd: ROOT });
    if (fs.existsSync(genFighters)) exec(`node "${genFighters}"`, { cwd: ROOT });

    return json(res, { ok: true, message: `✅ สร้าง ${fileName} + generate HTML สำเร็จ`, file: fileName });
  }

  // ── API: Sniper — รันบอทเฉพาะรายชื่อที่กำหนด ──
  if (method === 'POST' && pathname === '/api/sniper') {
    const body = await parseBody(req);
    const names = (body.names || '').trim();
    if (!names) return json(res, { ok: false, message: 'กรุณาระบุชื่อนักมวย' }, 400);
    const botPath = path.join(ROOT, 'scripts', 'scraper-bot.js');
    if (!fs.existsSync(botPath)) return json(res, { ok: false, message: 'ไม่พบ scripts/scraper-bot.js' });
    // เขียนรายชื่อ — bot จะอ่านตอน stream เท่านั้น
    fs.writeFileSync(path.join(ROOT, 'update_list.txt'), names, 'utf-8');
    return json(res, { ok: true });
  }

  // ── API: Sniper Stream (SSE — log realtime) ──
  if (method === 'GET' && pathname === '/api/sniper/stream') {
    if (!isAuthenticated(req)) { res.writeHead(401); return res.end(); }

    const botPath = path.join(ROOT, 'scripts', 'scraper-bot.js');
    if (!fs.existsSync(botPath)) {
      res.writeHead(200, { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', 'Connection':'keep-alive' });
      res.write(`data: ❌ ไม่พบ scripts/scraper-bot.js\n\n`);
      res.write(`data: __DONE__\n\n`);
      return res.end();
    }

    // ตรวจว่ามีรายชื่อใน update_list.txt ไหม
    const listPath = path.join(ROOT, 'update_list.txt');
    if (!fs.existsSync(listPath) || fs.readFileSync(listPath, 'utf-8').trim() === '') {
      res.writeHead(200, { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', 'Connection':'keep-alive' });
      res.write(`data: ❌ ไม่พบรายชื่อใน update_list.txt\n\n`);
      res.write(`data: __DONE__\n\n`);
      return res.end();
    }

    res.writeHead(200, {
      'Content-Type':      'text/event-stream; charset=utf-8',
      'Cache-Control':     'no-cache',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`: connected\n\n`);

    // spawn bot — อ่าน update_list.txt แล้วล้างเองใน scraper-bot.js
    const child = spawn('node', [botPath], { cwd: ROOT });

    function sendLine(line) {
      const clean = line.replace(/\r/g, '').trim();
      if (clean) res.write(`data: ${clean}\n\n`);
    }

    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', chunk => chunk.split('\n').forEach(sendLine));
    child.stderr.on('data', chunk => {
      chunk.split('\n').forEach(l => { const c=l.trim(); if(c) res.write(`data: ⚠️ ${c}\n\n`); });
    });
    child.on('close', code => {
      res.write(`data: \n\n`);
      res.write(`data: ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`);
      res.write(`data: ${code === 0 ? '✅ บอทปิดตัวเรียบร้อย' : `⚠️ บอทปิดด้วย code ${code}`}\n\n`);
      res.write(`data: __DONE__\n\n`);
      res.end();
    });
    req.on('close', () => { try { child.kill(); } catch {} });
    return;
  }

  // ── API: AI Parser — แปลงข้อความผลมวย → JSON ──
  if (method === 'POST' && pathname === '/api/parse-results') {
    const body = await parseBody(req);
    const { event_name, event_date, results_text, weigh_in_text } = body;
    if (!event_name || !event_date) return json(res, { ok: false, message: 'กรุณาระบุชื่อรายการและวันที่' }, 400);

    const logs = [];
    let updatedCount = 0, newCount = 0;

    // ── แปลงวิธีชนะ ──
    function translateMethod(methodTh) {
      if (!methodTh) return 'Decision';
      if (methodTh.includes('เอกฉันท์') && !methodTh.includes('ไม่')) return 'Unanimous Decision';
      if (methodTh.includes('ไม่เอกฉันท์')) return 'Split Decision';
      if (methodTh.includes('ข้างมาก')) return 'Majority Decision';
      if (methodTh.includes('น็อก') || methodTh.includes('KO') || methodTh.includes('TKO')) return 'KO/TKO';
      if (methodTh.includes('ซับมิชชัน')) return 'Submission';
      return 'Decision';
    }

    // ── ทำความสะอาดชื่อ ──
    function cleanName(name) {
      if (!name) return '';
      return name.replace(/[\u200b\u200c\u200d\uFEFF]/g, '').replace('\xa0', ' ')
        .replace(/[""].*?[""]/, '').replace(/\s*\(.*?\)\s*/g, '').replace(/\s+/g, ' ').trim();
    }

    // ── แปลงสัญชาติ ──
    function mapCountry(th) {
      const m = { 'ไทย':'Thailand','ญี่ปุ่น':'Japan','รัสเซีย':'Russia','จีน':'China',
        'สหรัฐอเมริกา':'United States','สหราชอาณาจักร':'United Kingdom','บราซิล':'Brazil',
        'ออสเตรเลีย':'Australia','ฝรั่งเศส':'France','เกาหลีใต้':'South Korea' };
      return m[th?.trim()] || th || 'ยังไม่มีข้อมูล';
    }

    // ── parse weigh-in ──
    const weighIns = {};
    if (weigh_in_text) {
      for (const line of weigh_in_text.trim().split('\n')) {
        const match = line.match(/(.+?)\s+ชั่งได้\s+([\d.]+)\s+ป\./);
        if (match) weighIns[cleanName(match[1])] = parseFloat(match[2]);
      }
    }

    // ── parse fight results ──
    const fights = [];
    if (results_text) {
      const methods = ['ชนะคะแนนเอกฉันท์','ชนะคะแนนไม่เอกฉันท์','ชนะคะแนนข้างมาก','ชนะคะแนน','ชนะน็อกเอาต์','ชนะน็อก','ชนะทีเคโอ','ชนะซับมิชชัน','ชนะ'];
      for (let line of results_text.trim().split('\n')) {
        line = line.replace(/คู่เอก|คู่รอง/g, '').trim();
        if (!line) continue;
        let foundMethod = '', winnerPart = '', loserPart = '';
        for (const m of methods) {
          if (line.includes(m)) {
            foundMethod = m;
            const parts = line.split(m);
            winnerPart = parts[0].trim(); loserPart = parts[1].trim();
            break;
          }
        }
        if (!winnerPart || !loserPart) continue;

        let round = 3, time = 'N/A';
        const rMatch = loserPart.match(/(ยกแรก|ยกที่\s*\d+|ยก\s*\d+)/);
        const tMatch = loserPart.match(/(?:นาทีที่|เวลา)\s*([\d:]+)/);
        if (rMatch) round = rMatch[1].includes('แรก') ? 1 : parseInt(rMatch[1].match(/\d+/)[0]);
        if (tMatch) time = tMatch[1];

        // ดึงสัญชาติในวงเล็บ
        const wCMatch = winnerPart.match(/\((.+?)\)$/);
        const lCMatch = loserPart.match(/\((.+?)\)$/);
        const wCountry = wCMatch ? mapCountry(wCMatch[1]) : 'ยังไม่มีข้อมูล';
        const lCountry = lCMatch ? mapCountry(lCMatch[1]) : 'ยังไม่มีข้อมูล';
        const winner = cleanName(winnerPart);
        const loser  = cleanName(loserPart);
        const methodEn = translateMethod(foundMethod);

        fights.push({ fighter: winner, opponent: loser,  oppCountry: lCountry, result: 'Win',  method: methodEn, round, time });
        fights.push({ fighter: loser,  opponent: winner, oppCountry: wCountry, result: 'Loss', method: methodEn, round, time });
      }
    }

    // ── บันทึกลง JSON ──
    const allTargets = new Set([...Object.keys(weighIns), ...fights.map(f => f.fighter)]);
    for (const name of allTargets) {
      const fileName = name.replace(/\s+/g, '-') + '.json';
      const filePath = path.join(DATA_DIR, fileName);
      let data, isNew = false;
      if (fs.existsSync(filePath)) {
        try { data = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { continue; }
      } else {
        // สร้างใหม่อัตโนมัติ
        isNew = true;
        data = { fighter_profile: { name_th: name, name_en: '', alias: 'ไม่ระบุ', image_url: name.replace(/\s+/g,'-'), grade: 'N/A', physical_stats: {}, performance_stats: {}, personal_info: {}, target_urls: [] }, fight_history: [], weigh_in_history: [] };
      }

      // อัปเดต weigh-in
      if (weighIns[name]) {
        const wkg = Math.round(weighIns[name] * 0.453592 * 10) / 10;
        data.fighter_profile.physical_stats.weight_lbs = weighIns[name];
        data.fighter_profile.physical_stats.weight_kg  = wkg;
        if (!data.weigh_in_history) data.weigh_in_history = [];
        data.weigh_in_history.unshift({ event_name, weight_lbs: weighIns[name], weight_kg: wkg });
      }

      // อัปเดตผลชก
      for (const fight of fights.filter(f => f.fighter === name)) {
        const isDup = (data.fight_history || []).some(e => e.opponent_th === fight.opponent && e.event_en === event_name);
        if (!isDup) {
          if (!data.fight_history) data.fight_history = [];
          data.fight_history.unshift({ result: fight.result, discipline_en: 'Muay Thai', method_en: fight.method, round: fight.round, time: fight.time, opponent_th: fight.opponent, opponent_en: '', opponent_country: fight.oppCountry, date: event_date, rating: 5, event_en: event_name });
        }
      }
      data.fight_history?.sort((a, b) => new Date(b.date) - new Date(a.date));
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      if (isNew) { newCount++; logs.push(`✨ สร้างใหม่: ${fileName}`); }
      else { updatedCount++; logs.push(`✅ อัปเดต: ${fileName}`); }
    }
    return json(res, { ok: true, logs, updatedCount, newCount });
  }

  // ── API: JSON Doctor — ซ่อมไฟล์พัง ──
  if (method === 'POST' && pathname === '/api/fix-json') {
    const logs = [];
    let fixedCount = 0;
    const broken = [];
    for (const file of fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && f !== 'fighters-list.json')) {
      const filePath = path.join(DATA_DIR, file);
      try {
        JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {
        // ลองซ่อม Git conflict markers
        try {
          let content = fs.readFileSync(filePath, 'utf-8');
          if (content.includes('<<<<<<< HEAD')) {
            const pattern = /<<<<<<< HEAD\n?([\s\S]*?)\n?=======\n?([\s\S]*?)\n?>>>>>>> [a-fA-F0-9]+\n?/g;
            const varA = content.replace(pattern, '$1\n');
            const varB = content.replace(pattern, '$2\n');
            try { JSON.parse(varA); fs.writeFileSync(filePath, varA, 'utf-8'); fixedCount++; logs.push(`🔧 ซ่อมสำเร็จ (HEAD): ${file}`); continue; } catch {}
            try { JSON.parse(varB); fs.writeFileSync(filePath, varB, 'utf-8'); fixedCount++; logs.push(`🔧 ซ่อมสำเร็จ (อัปเดต): ${file}`); continue; } catch {}
          }
          broken.push(file);
          logs.push(`❌ ซ่อมไม่ได้: ${file}`);
        } catch (e) {
          broken.push(file);
          logs.push(`❌ Error: ${file} — ${e.message}`);
        }
      }
    }
    return json(res, { ok: true, logs, fixedCount, brokenCount: broken.length, broken });
  }

  // ── API: Audit — ตรวจสอบข้อมูลที่ขาด ──
  if (method === 'GET' && pathname === '/api/audit') {
    const report = { total: 0, missingUrls: [], missingImages: [], missingPhysical: [], missingHistory: [] };
    for (const file of fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && f !== 'fighters-list.json')) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
        const p = data.fighter_profile || {};
        const name = p.name_th || file;
        report.total++;
        if (!p.target_urls?.length || p.target_urls[0] === '') report.missingUrls.push(name);
        if (!p.image_url || p.image_url === 'ไม่ระบุ') report.missingImages.push(name);
        if (!p.physical_stats?.height_cm || p.physical_stats.height_cm === 0) report.missingPhysical.push(name);
        if (!data.fight_history?.length) report.missingHistory.push(name);
      } catch {}
    }
    return json(res, { ok: true, report });
  }

  // 404
  json(res, { ok: false, message: 'ไม่พบ endpoint นี้' }, 404);
});

server.listen(PORT, () => {
  console.log(`\n🥊 BoxingFandom Admin Server`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🌐 เปิดที่: http://localhost:${PORT}/admin`);
  console.log(`🔑 รหัสผ่าน: ${ADMIN_PASSWORD}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});
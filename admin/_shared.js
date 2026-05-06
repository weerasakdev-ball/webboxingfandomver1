// ============================================================
// _shared.js — ใช้ร่วมกันทุกหน้า Admin
// ============================================================

const API = window.location.origin; // http://localhost:4000

// ── AUTH CHECK: ทุกหน้าต้อง login ก่อน ──
async function checkAuth() {
  try {
    const res = await fetch(`${API}/api/fighters`);
    if (res.status === 401) {
      window.location.href = '/admin/index.html';
    }
  } catch {
    window.location.href = '/admin/index.html';
  }
}

// ── LOGOUT ──
async function doLogout() {
  await fetch(`${API}/api/logout`, { method: 'POST' });
  window.location.href = '/admin/index.html';
}

// ── TOAST NOTIFICATION ──
function toast(msg, type = 'success') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = `
      position:fixed; bottom:24px; right:24px; padding:12px 20px;
      border-radius:8px; font-size:14px; font-weight:500;
      transform:translateY(80px); opacity:0; transition:all 0.3s;
      z-index:9999; display:flex; align-items:center; gap:8px;
      font-family:'Sarabun',sans-serif; max-width:320px;
      background:#0f172a; color:#fff;
    `;
    document.body.appendChild(el);
  }
  el.textContent = (type === 'success' ? '✅ ' : '❌ ') + msg;
  el.style.borderLeft = type === 'success' ? '4px solid #16a34a' : '4px solid #dc2626';
  el.style.transform = 'translateY(0)';
  el.style.opacity = '1';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.style.transform = 'translateY(80px)';
    el.style.opacity = '0';
  }, 3500);
}

// ── LOG BOX ──
function showLog(logId, text, append = false) {
  const el = document.getElementById(logId);
  if (!el) return;
  el.style.display = 'block';
  el.textContent = append ? el.textContent + '\n' + text : text;
  el.scrollTop = el.scrollHeight;
}

// ── SIDEBAR HTML (inject เข้าทุกหน้า) ──
function renderSidebar(activePage) {
  const pages = [
    { id: 'dashboard',     icon: '📊', label: 'Dashboard',           href: '/admin/dashboard.html',    group: 'หลัก' },
    { id: 'fighters',      icon: '🥊', label: 'รายชื่อนักมวย',       href: '/admin/fighters.html',     group: 'นักมวย' },
    { id: 'new-fighter',   icon: '➕', label: 'เพิ่มนักมวยใหม่',     href: '/admin/new-fighter.html',  group: 'นักมวย' },
    { id: 'edit-fighter',  icon: '✏️', label: 'แก้ไขรายบุคคล',       href: '/admin/edit-fighter.html', group: 'นักมวย' },
    { id: 'bulk-weight',   icon: '⚖️', label: 'อัปเดตน้ำหนัก',      href: '/admin/bulk-weight.html',    group: 'อัปเดต Bulk' },
    { id: 'event-parser',  icon: '🗓️', label: 'Event Parser',         href: '/admin/event-parser.html',   group: 'อัปเดต Bulk' },
    { id: 'bulk-fight',    icon: '🥊', label: 'เพิ่มผลชก',           href: '/admin/bulk-fight.html',     group: 'อัปเดต Bulk' },
    { id: 'sniper',        icon: '🎯', label: 'สไนเปอร์บอท',         href: '/admin/sniper.html',       group: 'เครื่องมือ' },
    { id: 'ai-parser',     icon: '🧠', label: 'AI Parser ผลมวย',     href: '/admin/ai-parser.html',    group: 'เครื่องมือ' },
    { id: 'commands',      icon: '⚙️', label: 'คำสั่งระบบ',          href: '/admin/commands.html',     group: 'ระบบ' },
    { id: 'doctor',        icon: '🔧', label: 'หมอซ่อม JSON',        href: '/admin/doctor.html',       group: 'ระบบ' },
    { id: 'audit',         icon: '🔍', label: 'ตรวจสอบข้อมูล',       href: '/admin/audit.html',        group: 'ระบบ' },
  ];

  // จัดกลุ่ม
  const groups = {};
  pages.forEach(p => {
    if (!groups[p.group]) groups[p.group] = [];
    groups[p.group].push(p);
  });

  let html = `
    <div style="padding:20px 20px 16px;border-bottom:1px solid #1e293b;">
      <a href="/admin/dashboard.html" style="text-decoration:none;">
        <div style="font-size:20px;font-weight:900;"><span style="color:#dc2626;">Boxing</span><span style="color:#fff;">Fandom</span></div>
        <div style="font-size:11px;color:#475569;margin-top:2px;">Admin Panel</div>
      </a>
    </div>
    <nav style="flex:1;padding:12px 0;overflow-y:auto;">`;

  Object.entries(groups).forEach(([group, items]) => {
    html += `<div style="padding:8px 16px 4px;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:1px;">${group}</div>`;
    items.forEach(p => {
      const isActive = p.id === activePage;
      html += `
        <a href="${p.href}" style="
          display:flex;align-items:center;gap:10px;padding:9px 16px;margin:1px 8px;
          color:${isActive ? '#fca5a5' : '#94a3b8'};font-size:14px;font-weight:500;
          border-radius:6px;text-decoration:none;
          background:${isActive ? 'rgba(220,38,38,0.15)' : 'transparent'};
          transition:all 0.15s;
        " onmouseover="if('${p.id}'!='${activePage}'){this.style.background='#1e293b';this.style.color='#fff';}"
           onmouseout="if('${p.id}'!='${activePage}'){this.style.background='transparent';this.style.color='#94a3b8';}">
          <span style="font-size:16px;width:20px;text-align:center;flex-shrink:0;">${p.icon}</span>
          <span>${p.label}</span>
        </a>`;
    });
  });

  html += `</nav>
    <div style="padding:16px;border-top:1px solid #1e293b;">
      <button onclick="doLogout()" style="
        width:100%;padding:8px;background:transparent;border:1px solid #1e293b;
        color:#64748b;border-radius:6px;font-size:13px;cursor:pointer;
        font-family:'Sarabun',sans-serif;transition:0.2s;
      " onmouseover="this.style.borderColor='#dc2626';this.style.color='#dc2626';"
         onmouseout="this.style.borderColor='#1e293b';this.style.color='#64748b';">
        ออกจากระบบ
      </button>
    </div>`;

  const wrap = document.getElementById('sidebar');
  if (wrap) wrap.innerHTML = html;
}

// ── CLOUDINARY URL ──
function getCloudinaryUrl(imgId, w, h) {
  if (!imgId || imgId === 'ไม่ระบุ' || imgId === 'ยังไม่มีข้อมูล' || imgId.trim() === '') {
    return '../../assets/images/noname.jpg';
  }
  if (imgId.startsWith('http') || imgId.startsWith('assets/')) return imgId;
  const clean = imgId.replace(/\.(jpg|jpeg|png|webp)$/i, '');
  return `https://res.cloudinary.com/dpvyl7nan/image/upload/c_fill,g_face,h_${h},w_${w},f_auto,q_auto/v1/${encodeURIComponent(clean)}`;
}

// ── SHARED CSS (inject เข้า <head>) ──
function injectSharedCSS() {
  const style = document.createElement('style');
  style.textContent = `
    :root {
      --red:#dc2626; --red-d:#b91c1c;
      --navy:#0f172a; --navy-2:#1e293b; --navy-3:#334155;
      --white:#ffffff; --bg:#f1f5f9; --border:#e2e8f0;
      --text:#0f172a; --muted:#64748b;
      --win:#16a34a; --win-bg:#f0fdf4;
      --loss:#dc2626; --loss-bg:#fef2f2;
      --warn:#d97706; --warn-bg:#fffbeb;
    }
    *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Sarabun',sans-serif; background:var(--bg); color:var(--text); min-height:100vh; display:flex; -webkit-font-smoothing:antialiased; }
    a { text-decoration:none; color:inherit; }
    button { font-family:'Sarabun',sans-serif; cursor:pointer; }
    input, select, textarea { font-family:'Sarabun',sans-serif; }

    #sidebar { position:fixed; top:0; left:0; width:220px; height:100vh; background:var(--navy); border-right:1px solid var(--navy-2); display:flex; flex-direction:column; z-index:100; overflow-y:auto; }
    .main { margin-left:220px; padding:32px; flex:1; min-height:100vh; }
    .page-title { font-size:24px; font-weight:800; margin-bottom:24px; display:flex; align-items:center; gap:10px; }
    .page-title::before { content:''; display:block; width:5px; height:24px; background:var(--red); border-radius:3px; }

    .card { background:var(--white); border:1px solid var(--border); border-radius:12px; padding:24px; margin-bottom:20px; }
    .card-title { font-size:15px; font-weight:700; margin-bottom:16px; color:var(--navy); display:flex; align-items:center; gap:8px; }
    .card-desc { font-size:13px; color:var(--muted); margin-bottom:20px; line-height:1.6; }

    .stats-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:16px; margin-bottom:24px; }
    .stat-box { background:var(--white); border:1px solid var(--border); border-radius:10px; padding:20px 16px; text-align:center; }
    .stat-box b { display:block; font-size:30px; font-weight:900; color:var(--red); }
    .stat-box span { font-size:12px; color:var(--muted); font-weight:500; }

    .btn { padding:9px 18px; border-radius:7px; font-size:14px; font-weight:600; border:none; transition:all 0.2s; display:inline-flex; align-items:center; gap:6px; cursor:pointer; }
    .btn-red   { background:var(--red); color:#fff; }
    .btn-red:hover { background:var(--red-d); }
    .btn-dark  { background:var(--navy); color:#fff; }
    .btn-dark:hover { background:var(--navy-2); }
    .btn-ghost { background:transparent; color:var(--text); border:1px solid var(--border); }
    .btn-ghost:hover { background:var(--bg); }
    .btn-green { background:var(--win); color:#fff; }
    .btn-green:hover { background:#15803d; }
    .btn-sm    { padding:5px 12px; font-size:12px; }

    .form-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:16px; }
    .form-group { display:flex; flex-direction:column; gap:6px; }
    .form-group label { font-size:12px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px; }
    .form-group input, .form-group select, .form-group textarea { padding:9px 12px; border:1px solid var(--border); border-radius:7px; font-size:14px; outline:none; transition:0.2s; background:#fff; }
    .form-group input:focus, .form-group select:focus, .form-group textarea:focus { border-color:var(--red); }
    .form-group textarea { resize:vertical; min-height:80px; }
    .form-actions { display:flex; gap:10px; margin-top:20px; flex-wrap:wrap; }

    .table-wrap { overflow-x:auto; border-radius:10px; border:1px solid var(--border); }
    table { width:100%; border-collapse:collapse; font-size:14px; }
    thead th { background:var(--bg); padding:12px 16px; text-align:left; font-weight:700; font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid var(--border); white-space:nowrap; }
    tbody td { padding:12px 16px; border-bottom:1px solid var(--border); vertical-align:middle; }
    tbody tr:last-child td { border-bottom:none; }
    tbody tr:hover td { background:var(--bg); }

    .badge { display:inline-block; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700; }
    .badge-win  { background:var(--win-bg); color:var(--win); }
    .badge-loss { background:var(--loss-bg); color:var(--loss); }
    .badge-draw { background:#f1f5f9; color:#64748b; border:1px solid #e2e8f0; }
    .badge-blue { background:#dbeafe; color:#1d4ed8; }
    .badge-warn { background:var(--warn-bg); color:var(--warn); }

    .log-box { background:var(--navy); color:#86efac; font-family:monospace; font-size:13px; padding:16px; border-radius:8px; min-height:60px; max-height:240px; overflow-y:auto; white-space:pre-wrap; word-break:break-all; margin-top:16px; display:none; }

    .search-bar { display:flex; gap:10px; margin-bottom:16px; }
    .search-bar input { flex:1; padding:9px 14px; border:1px solid var(--border); border-radius:7px; font-size:14px; outline:none; }
    .search-bar input:focus { border-color:var(--red); }

    input[type=checkbox] { width:15px; height:15px; accent-color:var(--red); cursor:pointer; }

    .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:500; display:none; align-items:center; justify-content:center; padding:20px; }
    .modal-overlay.show { display:flex; }
    .modal { background:#fff; border-radius:14px; padding:32px; width:100%; max-width:700px; max-height:90vh; overflow-y:auto; }
    .modal-title { font-size:18px; font-weight:800; margin-bottom:24px; display:flex; align-items:center; justify-content:space-between; }
    .modal-close { background:none; border:none; font-size:20px; cursor:pointer; color:var(--muted); }

    @media (max-width:768px) {
      #sidebar { width:56px; }
      #sidebar span:not(.icon) { display:none; }
      .main { margin-left:56px; padding:16px; }
    }
  `;
  document.head.appendChild(style);
}
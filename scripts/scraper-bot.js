// ============================================================
// BoxingFandom — Scraper Bot v2.0
// รัน: node scripts/scraper-bot.js
// Sniper mode: อ่านรายชื่อจาก update_list.txt
// ============================================================

const fs       = require('fs');
const path     = require('path');
const axios    = require('axios');
const cheerio  = require('cheerio');
const puppeteer = require('puppeteer');
const { execSync } = require('child_process');

// ─── PATHS ───
const ROOT             = path.join(__dirname, '..');
const DATA_DIR         = path.join(ROOT, 'data', 'boxers');
const UPDATE_LIST_PATH = path.join(ROOT, 'update_list.txt');
const GEN_FIGHTERS     = path.join(ROOT, 'scripts', 'generate-fighters.js');
const GEN_LIST         = path.join(ROOT, 'scripts', 'generate-list.js');

// ─── ANTI-BAN CONFIG ───
const CONFIG = {
  minDelay:      3000,   // หน่วง min ระหว่าง request (ms)
  maxDelay:      7000,   // หน่วง max ระหว่าง request (ms)
  pageLoadDelay: 4000,   // รอหลัง page load
  retryMax:      3,      // retry กี่ครั้งถ้า fail
  retryDelay:    10000,  // รอก่อน retry (ms)
  maxClicks:     50,     // กด "โหลดเพิ่ม" สูงสุด
};

// ─── USER AGENTS หมุนเวียน ───
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function randomDelay(min = CONFIG.minDelay, max = CONFIG.maxDelay) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(r => setTimeout(r, ms));
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function formatThaiDate(thaiDateStr) {
  if (!thaiDateStr) return null;
  const parts = thaiDateStr.split(' ')[0].split('/');
  if (parts.length === 3) {
    const day   = parseInt(parts[0], 10).toString().padStart(2, '0');
    const mIdx  = parseInt(parts[1], 10) - 1;
    const year  = parseInt(parts[2], 10) - 543;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (mIdx >= 0 && mIdx <= 11) return `${months[mIdx]} ${day}, ${year}`;
  }
  return thaiDateStr;
}

function parseOneFcDate(str) {
  if (!str) return null;
  const clean = str.trim().replace(/\s+/g,' ').replace(/,/g,'');
  const parts = clean.split(' ');
  if (parts.length < 3) return str;

  let day, monthRaw, year;
  if (isNaN(parseInt(parts[0], 10))) {
    [monthRaw, day, year] = parts;
  } else {
    [day, monthRaw, year] = parts;
  }

  day = parseInt(day, 10).toString().padStart(2, '0');
  if (parseInt(year, 10) > 2500) year = (parseInt(year, 10) - 543).toString();

  const MM = {
    'ม.ค.':'Jan','ก.พ.':'Feb','มี.ค.':'Mar','เม.ย.':'Apr','พ.ค.':'May','มิ.ย.':'Jun',
    'ก.ค.':'Jul','ส.ค.':'Aug','ก.ย.':'Sep','ต.ค.':'Oct','พ.ย.':'Nov','ธ.ค.':'Dec',
    'มกราคม':'Jan','กุมภาพันธ์':'Feb','มีนาคม':'Mar','เมษายน':'Apr','พฤษภาคม':'May','มิถุนายน':'Jun',
    'กรกฎาคม':'Jul','สิงหาคม':'Aug','กันยายน':'Sep','ตุลาคม':'Oct','พฤศจิกายน':'Nov','ธันวาคม':'Dec',
    'Jan':'Jan','Feb':'Feb','Mar':'Mar','Apr':'Apr','May':'May','Jun':'Jun',
    'Jul':'Jul','Aug':'Aug','Sep':'Sep','Oct':'Oct','Nov':'Nov','Dec':'Dec',
    'January':'Jan','February':'Feb','March':'Mar','April':'Apr','August':'Aug',
    'September':'Sep','October':'Oct','November':'Nov','December':'Dec'
  };

  const engMonth = MM[monthRaw] || monthRaw.substring(0,3);
  if (!engMonth || isNaN(year) || isNaN(day)) return str;
  return `${engMonth} ${day}, ${year}`;
}

function mapCountry(th) {
  if (!th || th === 'ไม่ระบุ' || th === 'ยังไม่มีข้อมูล') return 'ยังไม่มีข้อมูล';
  const m = {
    'ฝรั่งเศส':'France','แอลจีเรีย':'Algeria','มองโกเลีย':'Mongolia',
    'อิหร่าน':'Iran','ตุรกี':'Turkey','ฮ่องกง':'Hong Kong',
    'นิวซีแลนด์':'New Zealand','อินเดีย':'India','ญี่ปุ่น':'Japan',
    'สหราชอาณาจักร':'United Kingdom','บราซิล':'Brazil',
    'พม่า':'Myanmar','เมียนมา':'Myanmar','รัสเซีย':'Russia',
    'อเมริกา':'United States','สหรัฐอเมริกา':'United States',
    'จีน':'China','ไทย':'Thailand','จอร์เจีย':'Georgia',
    'อาเซอร์ไบจาน':'Azerbaijan','มาเลเซีย':'Malaysia','ออสเตรเลีย':'Australia',
    'สเปน':'Spain','โมร็อกโก':'Morocco','อุซเบกิสถาน':'Uzbekistan',
    'อิตาลี':'Italy','แคนาดา':'Canada','เกาหลีใต้':'South Korea',
    'เบลารุส':'Belarus','สกอตแลนด์':'Scotland','คาซัคสถาน':'Kazakhstan',
    'กัมพูชา':'Cambodia','เวียดนาม':'Vietnam','อินโดนีเซีย':'Indonesia',
    'ตูนิเซีย':'Tunisia','ซูรินาม':'Suriname',
  };
  return th.split(/[\/,]/).map(c => m[c.trim()] || c.trim()).join('/');
}

function isThai(text) {
  return /[\u0E00-\u0E7F]/.test(text);
}

function isDuplicate(history, date, opponent, round, time) {
  return history.some(f => {
    // เช็คจากวันที่ใกล้เคียง (±2 วัน)
    const d1 = new Date(f.date), d2 = new Date(date);
    if (!isNaN(d1) && !isNaN(d2)) {
      const diff = Math.abs(d1 - d2) / (1000 * 60 * 60 * 24);
      if (diff <= 2) return true;
    }
    // เช็คจากคู่ชก + ยก + เวลา
    const sameOpp = (f.opponent_th === opponent || f.opponent_en === opponent);
    if (sameOpp && f.round === round && f.time === time) return true;
    return false;
  });
}

// ============================================================
// MODULE 1: THBOXING SCRAPER
// ============================================================
async function scrapeThboxing(url, fighterData, fighterName) {
  let added = 0;
  for (let attempt = 1; attempt <= CONFIG.retryMax; attempt++) {
    try {
      const res = await axios.get(url, {
        headers: {
          'User-Agent': randomUA(),
          'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': 'https://www.thboxing.com/',
        },
        timeout: 15000,
      });

      const $ = cheerio.load(res.data);
      const rows = $('table.table-striped tr');

      for (let j = 1; j < rows.length; j++) {
        const cols = rows.eq(j).find('td');
        if (cols.length < 5) continue;

        const rawDate   = cols.eq(0).text().trim();
        const eventName = cols.eq(1).text().trim();
        const redTd     = cols.eq(2);
        const blueTd    = cols.eq(4);
        const redName   = redTd.text().trim();
        const blueName  = blueTd.text().trim();
        const resultBtn = cols.eq(3).find('.btn').text().trim();

        if (!rawDate) continue;
        const date = formatThaiDate(rawDate);
        if (!date) continue;

        const isOwnerRed = redTd.attr('style')?.includes('#ffffcc') ? true
          : blueTd.attr('style')?.includes('#ffffcc') ? false
          : redName.includes(fighterName.split(' ')[0]);

        const opponentName = isOwnerRed ? blueName : redName;
        const oppTh = isThai(opponentName) ? opponentName : '';
        const oppEn = isThai(opponentName) ? '' : opponentName;

        let result = 'Draw';
        if (resultBtn.includes('ชนะ')) result = isOwnerRed ? 'Win' : 'Loss';
        else if (resultBtn.includes('แพ้')) result = isOwnerRed ? 'Loss' : 'Win';

        let method = 'Decision';
        if (resultBtn.includes('น็อก') || /KO|TKO/i.test(resultBtn)) method = 'KO/TKO';

        let round = 3;
        const rm = resultBtn.match(/ยก\s*(\d+)/);
        if (rm) round = parseInt(rm[1], 10);

        if (!isDuplicate(fighterData.fight_history, date, opponentName, round, 'N/A')) {
          fighterData.fight_history.push({
            result, discipline_en:'Muay Thai', method_en:method, round, time:'N/A',
            opponent_th:oppTh, opponent_en:oppEn, opponent_country:'Thailand',
            date, rating:5, event_en:eventName
          });
          added++;
        }
      }
      break; // สำเร็จ ออกจาก retry loop
    } catch (e) {
      console.log(`      ⚠️ [THBoxing] attempt ${attempt}/${CONFIG.retryMax}: ${e.message}`);
      if (attempt < CONFIG.retryMax) await randomDelay(CONFIG.retryDelay, CONFIG.retryDelay * 2);
    }
  }
  return added;
}

// ============================================================
// MODULE 2: ONE FC SCRAPER
// ============================================================
async function scrapeOneFc(page, url, fighterData, fighterName) {
  let added = 0;
  let profileUpdated = false;

  // normalize URL เป็น /th/
  let fetchUrl = url;
  if (fetchUrl.includes('onefc.com/athletes/') && !fetchUrl.includes('/th/athletes/')) {
    fetchUrl = fetchUrl.replace('.com/athletes/', '.com/th/athletes/');
  }

  for (let attempt = 1; attempt <= CONFIG.retryMax; attempt++) {
    try {
      // ── Anti-ban: สุ่ม UA และ viewport ──
      await page.setUserAgent(randomUA());
      await page.setViewport({
        width:  1280 + Math.floor(Math.random() * 200),
        height: 800  + Math.floor(Math.random() * 200),
      });
      // ซ่อน webdriver fingerprint
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] });
      });

      await page.goto(fetchUrl, { waitUntil:'networkidle2', timeout:40000 });
      await randomDelay(CONFIG.pageLoadDelay, CONFIG.pageLoadDelay + 2000);

      // ── กด "โหลดเพิ่ม" ──
      let clicks = 0;
      while (clicks < CONFIG.maxClicks) {
        const hasMore = await page.evaluate(() => {
          window.scrollBy(0, 600);
          const btn = Array.from(document.querySelectorAll('a, button')).find(el => {
            const t = (el.innerText || el.textContent || '').toLowerCase();
            return (t.includes('แสดงเพิ่มเติม') || t.includes('load more')) && el.offsetParent !== null;
          });
          if (btn) { btn.click(); return true; }
          return false;
        });
        if (!hasMore) break;
        clicks++;
        await randomDelay(2000, 3500);
      }

      const $ = cheerio.load(await page.content());
      const p = fighterData.fighter_profile;
      if (!p.personal_info)  p.personal_info  = {};
      if (!p.physical_stats) p.physical_stats  = {};
      const pi = p.personal_info;
      const ps = p.physical_stats;
      const bodyText = $('body').text().replace(/\s+/g,' ');

      // ── อัปเดต profile ที่ยังขาด ──
      if (!pi.age || pi.age === 0) {
        const m = bodyText.match(/อายุ\s*(\d+)/);
        if (m) { pi.age = parseInt(m[1],10); profileUpdated = true; }
      }
      if (!ps.height_cm || ps.height_cm === 0) {
        const m = bodyText.match(/(\d+)\s*(?:ซม\.|ซม)/);
        if (m) { ps.height_cm = parseInt(m[1],10); profileUpdated = true; }
      }
      if (!pi.country_th || pi.country_th === 'ยังไม่มีข้อมูล') {
        const m = bodyText.match(/ประเทศ\s+(.*?)\s+อายุ/);
        if (m) { pi.country_th = m[1].trim(); pi.country_en = mapCountry(pi.country_th); profileUpdated = true; }
      }
      if (!pi.team_th || pi.team_th === 'ยังไม่มีข้อมูล' || pi.team_th === 'ไม่ระบุ') {
        const m = bodyText.match(/ทีม\s+([A-Za-z\u0E00-\u0E7F0-9\s.\-\/]{2,50}?)(?=\s+(?:การเดินทาง|ประวัติ|สถิติ|ผล|ONE|อายุ|ประเทศ)|$)/);
        if (m && m[1].trim().length > 0) {
          pi.team_th = m[1].trim();
          profileUpdated = true;
          console.log(`      🏢 ค่าย: ${pi.team_th}`);
        }
      }
      // auto name_en จาก URL slug
      if (!p.name_en || p.name_en.trim() === '' || p.name_en === 'ไม่ระบุ') {
        const slug = fetchUrl.match(/\/athletes\/([^\/]+)/);
        if (slug) {
          p.name_en = slug[1].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          profileUpdated = true;
          console.log(`      📝 ชื่อ EN: ${p.name_en}`);
        }
      }

      // ── ดึง fight history ──
      const rows = $('table.simple-table.is-mobile-row-popup tr.is-data-row, table tr.is-data-row');
      rows.each((_, el) => {
        const rawResult = $(el).find('td.result .is-distinct').first().text().trim();
        let result = 'Draw';
        if (rawResult.includes('ชนะ') || rawResult.toLowerCase() === 'win') result = 'Win';
        else if (rawResult.includes('แพ้') || rawResult.toLowerCase() === 'loss') result = 'Loss';

        let discipline = $(el).find('td.sport').first().text().trim();
        if (discipline.includes('มวยไทย') || discipline.includes('Muay Thai')) discipline = 'Muay Thai';
        else if (discipline.includes('คิกบ็อกซิ่ง') || discipline.includes('Kickboxing')) discipline = 'Kickboxing';
        else if (discipline.includes('ผสมผสาน') || discipline.includes('MMA')) discipline = 'MMA';

        const rawMethod = $(el).find('td.method').contents().first().text().trim();
        let method = 'Decision';
        if (rawMethod.includes('น็อกเอาต์') || rawMethod.includes('KO')) method = 'KO/TKO';
        else if (rawMethod.includes('ซับมิชชัน') || rawMethod.includes('Submission')) method = 'Submission';
        else if (rawMethod.includes('เอกฉันท์') || rawMethod.includes('Unanimous')) method = 'Unanimous Decision';
        else if (rawMethod.includes('ไม่เอกฉันท์') || rawMethod.includes('Split')) method = 'Split Decision';
        else if (rawMethod.includes('ข้างมาก') || rawMethod.includes('Majority')) method = 'Majority Decision';

        const rawRT = $(el).find('td.round').first().text().trim();
        let round = 3, time = 'N/A';
        const rm = rawRT.match(/(?:ยก|R)\s*(\d+)/i);
        const tm = rawRT.match(/\((.*?)\)/);
        if (rm) round = parseInt(rm[1],10);
        if (tm) time  = tm[1].trim();

        const opponent = $(el).find('td.opponent h5.fs-100').first().text().trim();
        const oppCountry = mapCountry($(el).find('td.opponent .opponent-country').first().text().trim() || 'ไม่ระบุ');
        const oppTh = isThai(opponent) ? opponent : '';
        const oppEn = isThai(opponent) ? '' : opponent;

        const date = parseOneFcDate($(el).find('td.date').first().text().trim());
        let eventName = $(el).find('td.event h5.fs-100').first().text().trim();
        if (eventName && !eventName.toUpperCase().includes('ONE')) eventName = 'ONE ' + eventName;

        if (!opponent || !date) return;

        // อัปเดต upcoming fight ถ้ามีอยู่แล้ว (result = "")
        const upcomingIdx = fighterData.fight_history.findIndex(f =>
          f.result === '' &&
          (f.opponent_th === opponent || f.opponent_en === opponent || f.event_en === eventName)
        );
        if (upcomingIdx !== -1) {
          fighterData.fight_history[upcomingIdx] = {
            ...fighterData.fight_history[upcomingIdx],
            result, discipline_en:discipline, method_en:method, round, time,
            opponent_th:oppTh, opponent_en:oppEn, opponent_country:oppCountry,
            date, event_en:eventName
          };
          added++;
          console.log(`      🔄 อัปเดต upcoming → ${result} เจอกับ ${opponent}`);
          return;
        }

        if (!isDuplicate(fighterData.fight_history, date, opponent, round, time)) {
          fighterData.fight_history.push({
            result, discipline_en:discipline, method_en:method, round, time,
            opponent_th:oppTh, opponent_en:oppEn, opponent_country:oppCountry,
            date, rating:5, event_en:eventName
          });
          added++;
          console.log(`      ➕ ${result} เจอกับ ${opponent} (${date})`);
        }
      });

      break; // สำเร็จ ออก retry loop
    } catch (e) {
      console.log(`      ⚠️ [ONE FC] attempt ${attempt}/${CONFIG.retryMax}: ${e.message}`);
      if (attempt < CONFIG.retryMax) {
        await randomDelay(CONFIG.retryDelay, CONFIG.retryDelay * 2);
        // reload page ใหม่ถ้า timeout
        try { await page.goto('about:blank'); } catch {}
      }
    }
  }

  return { added, profileUpdated };
}

// ============================================================
// MAIN — รองรับ Sniper Mode
// ============================================================
async function run() {
  console.log('\n🤖 BoxingFandom Scraper Bot v2.0');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ── โหลดรายชื่อ sniper ถ้ามี ──
  let sniperNames = [];
  if (fs.existsSync(UPDATE_LIST_PATH)) {
    const raw = fs.readFileSync(UPDATE_LIST_PATH, 'utf-8').trim();
    if (raw) {
      sniperNames = raw.split('\n').map(n => n.trim()).filter(Boolean);
      console.log(`🎯 Sniper Mode: ${sniperNames.length} รายชื่อ`);
      sniperNames.forEach(n => console.log(`   • ${n}`));
      console.log('');
      // ล้างไฟล์หลังอ่าน เพื่อไม่ให้รันซ้ำ
      fs.writeFileSync(UPDATE_LIST_PATH, '', 'utf-8');
    }
  }

  // ── โหลดไฟล์ทั้งหมด ──
  const allFiles = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && f !== 'fighters-list.json');

  // ── filter เฉพาะ sniper ถ้ามีรายชื่อ ──
  let targetFiles = allFiles;
  if (sniperNames.length > 0) {
    targetFiles = allFiles.filter(file => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
        const nameTh = (data.fighter_profile?.name_th || '').toLowerCase();
        const nameEn = (data.fighter_profile?.name_en || '').toLowerCase();
        return sniperNames.some(n => {
          const nl = n.toLowerCase();
          return nameTh.includes(nl) || nameEn.includes(nl) ||
                 nl.includes(nameTh.split(' ')[0]) ||
                 file.toLowerCase().includes(nl.replace(/\s+/g,'-'));
        });
      } catch { return false; }
    });

    if (targetFiles.length === 0) {
      console.log('❌ ไม่พบไฟล์ที่ตรงกับรายชื่อ sniper');
      return;
    }
    console.log(`✅ พบไฟล์ที่ตรงกัน: ${targetFiles.length} ไฟล์\n`);
  } else {
    console.log(`📂 All Mode: สแกนทั้งหมด ${allFiles.length} ไฟล์\n`);
  }

  // ── launch browser ──
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1280,800',
    ],
  });
  const page = await browser.newPage();

  // ซ่อน headless fingerprint
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8' });

  let totalUpdated = 0;

  try {
    for (let i = 0; i < targetFiles.length; i++) {
      const filePath = path.join(DATA_DIR, targetFiles[i]);
      let data;
      try {
        data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch { continue; }

      if (!data.fighter_profile) continue;
      const p     = data.fighter_profile;
      const name  = p.name_th || targetFiles[i];
      let needSave = false;

      console.log(`\n[${i+1}/${targetFiles.length}] ⏳ ${name}`);

      // ── Auto name_en จาก URL slug ──
      if (!p.name_en || p.name_en.trim() === '' || p.name_en === 'ไม่ระบุ') {
        const url = p.target_urls?.[0] || p.target_url;
        if (url) {
          const slug = url.match(/\/athletes\/([^\/]+)/);
          if (slug) {
            p.name_en = slug[1].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            needSave = true;
            console.log(`      📝 ชื่อ EN: ${p.name_en}`);
          }
        }
      }

      // ── Auto-heal: ล้างวันที่พัง + dedupe ──
      if (data.fight_history) {
        const before = data.fight_history.length;
        data.fight_history = data.fight_history.filter(f => f.date && !f.date.includes('NaN'));
        const seen = new Set();
        data.fight_history = data.fight_history.filter(f => {
          if (!f.date) return true;
          const key = `${f.date}_${f.opponent_th || f.opponent_en}`;
          if (seen.has(key)) return false;
          seen.add(key); return true;
        });
        if (data.fight_history.length !== before) {
          needSave = true;
          console.log(`      🧹 ล้างข้อมูลพัง/ซ้ำ ${before - data.fight_history.length} รายการ`);
        }
      }
      if (!data.fight_history)    data.fight_history    = [];
      if (!data.weigh_in_history) data.weigh_in_history = [];

      // migrate target_url → target_urls
      if (p.target_url && !p.target_urls?.length) {
        p.target_urls = [p.target_url];
        delete p.target_url;
        needSave = true;
      }

      const urls = Array.isArray(p.target_urls) ? p.target_urls.filter(Boolean) : [];
      if (urls.length === 0) {
        if (needSave) {
          fs.writeFileSync(filePath, JSON.stringify(data,null,2),'utf-8');
          totalUpdated++;
        }
        console.log(`      ⏭️ ไม่มี target_url ข้ามการ scrape`);
        continue;
      }

      let addedTotal = 0, profUpdated = false;

      for (const url of urls) {
        if (!url) continue;
        await randomDelay(); // หน่วงก่อนทุก request

        if (url.includes('thboxing.com')) {
          const added = await scrapeThboxing(url, data, name);
          addedTotal += added;
          if (added > 0) console.log(`      ✅ [THBoxing] เพิ่ม ${added} ไฟต์`);
        } else if (url.includes('onefc.com')) {
          const { added, profileUpdated } = await scrapeOneFc(page, url, data, name);
          addedTotal += added;
          if (profileUpdated) profUpdated = true;
          if (added > 0) console.log(`      ✅ [ONE FC] เพิ่ม ${added} ไฟต์`);
        }
      }

      if (addedTotal > 0 || needSave || profUpdated) {
        data.fight_history.sort((a,b) => {
          // upcoming (result="") ไว้บนสุดก่อน
          if (a.result === '' && b.result !== '') return -1;
          if (a.result !== '' && b.result === '') return 1;
          return new Date(b.date) - new Date(a.date);
        });
        fs.writeFileSync(filePath, JSON.stringify(data,null,2),'utf-8');
        totalUpdated++;
        console.log(`      💾 บันทึกแล้ว (+${addedTotal} ไฟต์)`);
      } else {
        console.log(`      ✓ ข้อมูลเป็นปัจจุบันแล้ว`);
      }
    }
  } catch (e) {
    console.error('\n🚨 Error:', e.message);
  } finally {
    await browser.close();
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ เสร็จสิ้น! อัปเดต ${totalUpdated}/${targetFiles.length} ไฟล์`);

  // รัน generate scripts ถ้าอัปเดตมีข้อมูลใหม่
  if (totalUpdated > 0) {
    try {
      if (fs.existsSync(GEN_LIST))     execSync(`node "${GEN_LIST}"`,     { stdio:'inherit', cwd:ROOT });
      if (fs.existsSync(GEN_FIGHTERS)) execSync(`node "${GEN_FIGHTERS}"`, { stdio:'inherit', cwd:ROOT });
    } catch {}
  }
}

run();
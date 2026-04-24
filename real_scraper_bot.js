const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const { execSync } = require('child_process');

// ==========================================================================
// ⚙️ อัปเดต Path สำหรับโปรเจกต์
// ==========================================================================
const dataFolder = path.join(__dirname, 'data', 'boxers');
const generateScriptPath = path.join(__dirname, 'generate-fighters.js');
const generateListPath = path.join(__dirname, 'generate-list.js');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================================================
// 🛠️ UTILITY FUNCTIONS
// ==========================================================================

function formatThaiDateToEnglish(thaiDateStr) {
    if (!thaiDateStr) return null;
    const datePart = thaiDateStr.split(' ')[0]; 
    const parts = datePart.split('/');
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10).toString().padStart(2, '0'); 
        const monthIndex = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10) - 543;
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        if (monthIndex >= 0 && monthIndex <= 11) {
            return `${monthNames[monthIndex]} ${day}, ${year}`;
        }
    }
    return thaiDateStr;
}

function parseOneFcDate(dateString) {
    if (!dateString) return null;
    let cleanStr = dateString.trim().replace(/\s+/g, ' ').replace(/,/g, '');
    const parts = cleanStr.split(' ');
    
    if (parts.length >= 3) {
        let day, monthRaw, year;
        if (isNaN(parseInt(parts[0], 10))) {
            monthRaw = parts[0]; day = parts[1]; year = parts[2];
        } else {
            day = parts[0]; monthRaw = parts[1]; year = parts[2];
        }
        
        day = parseInt(day, 10).toString().padStart(2, '0');
        if (parseInt(year, 10) > 2500) year = (parseInt(year, 10) - 543).toString();

        const monthMap = {
            "ม.ค.": "Jan", "ก.พ.": "Feb", "มี.ค.": "Mar", "เม.ย.": "Apr", "พ.ค.": "May", "มิ.ย.": "Jun",
            "ก.ค.": "Jul", "ส.ค.": "Aug", "ก.ย.": "Sep", "ต.ค.": "Oct", "พ.ย.": "Nov", "ธ.ค.": "Dec",
            "มกราคม": "Jan", "กุมภาพันธ์": "Feb", "มีนาคม": "Mar", "เมษายน": "Apr", "พฤษภาคม": "May", "มิถุนายน": "Jun",
            "กรกฎาคม": "Jul", "สิงหาคม": "Aug", "กันยายน": "Sep", "ตุลาคม": "Oct", "พฤศจิกายน": "Nov", "ธันวาคม": "Dec",
            "Jan": "Jan", "Feb": "Feb", "Mar": "Mar", "Apr": "Apr", "May": "May", "Jun": "Jun",
            "Jul": "Jul", "Aug": "Aug", "Sep": "Sep", "Oct": "Oct", "Nov": "Nov", "Dec": "Dec",
            "January": "Jan", "February": "Feb", "March": "Mar", "April": "Apr", "August": "Aug", "September": "Sep",
            "October": "Oct", "November": "Nov", "December": "Dec"
        };
        
        const engMonth = monthMap[monthRaw] || monthRaw.substring(0,3);
        if(!engMonth || engMonth.includes("undefined") || isNaN(year) || isNaN(day)) return dateString;
        return `${engMonth} ${day}, ${year}`;
    }
    return dateString;
}

function mapCountryToEnglish(countryTh) {
    if (!countryTh || countryTh === "ไม่ระบุ" || countryTh === "ยังไม่มีข้อมูล") return "ยังไม่มีข้อมูล";
    const mapping = {
        "ฝรั่งเศส": "France", "แอลจีเรีย": "Algeria", "มองโกเลีย": "Mongolia",
        "อิหร่าน": "Iran", "ตุรกี": "Turkey", "ฮ่องกง": "Hong Kong", 
        "นิวซีแลนด์": "New Zealand", "อินเดีย": "India", "ญี่ปุ่น": "Japan", 
        "สหราชอาณาจักร": "United Kingdom", "บราซิล": "Brazil",
        "พม่า": "Myanmar", "เมียนมา": "Myanmar", "รัสเซีย": "Russia",
        "อเมริกา": "United States", "สหรัฐอเมริกา": "United States", 
        "จีน": "China", "ไทย": "Thailand", "จอร์เจีย": "Georgia", 
        "อาเซอร์ไบจาน": "Azerbaijan", "มาเลเซีย": "Malaysia", "ออสเตรเลีย": "Australia",
        "สเปน": "Spain", "โมร็อกโก": "Morocco", "อุซเบกิสถาน": "Uzbekistan"
    };
    return countryTh.split(/[\/,]/).map(c => mapping[c.trim()] || c.trim()).join('/');
}

function containsThai(text) {
    return /[\u0E00-\u0E7F]/.test(text);
}

// ==========================================================================
// 🥊 MODULE 1: ดึงข้อมูลจาก THBOXING
// ==========================================================================
async function scrapeThboxing(url, fighterData, fighterName, historyKey) {
    let addedCount = 0;
    try {
        const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
        const $ = cheerio.load(response.data);
        const rows = $('table.table-striped tr');
        
        for (let j = 1; j < rows.length; j++) {
            const columns = rows.eq(j).find('td');
            if (columns.length < 5) continue;

            const rawDate = columns.eq(0).text().trim();
            const eventName = columns.eq(1).text().trim();
            const redTd = columns.eq(2);
            const blueTd = columns.eq(4);
            const redCornerName = redTd.text().trim();
            const blueCornerName = blueTd.text().trim();
            const rawResultBtn = columns.eq(3).find('.btn').text().trim();

            if (!rawDate) continue;
            const formattedDate = formatThaiDateToEnglish(rawDate);
            if (!formattedDate) continue;

            const scrapedDateObj = new Date(formattedDate);
            const isDuplicate = fighterData[historyKey].some(existingFight => {
                const existingDateObj = new Date(existingFight.date);
                if (isNaN(existingDateObj)) return false; 
                const diffTime = Math.abs(scrapedDateObj - existingDateObj);
                return (diffTime / (1000 * 60 * 60 * 24)) <= 2; 
            });

            if (isDuplicate) continue; 

            let isOwnerRed = (redTd.attr('style') && redTd.attr('style').includes('#ffffcc')) ? true : 
                           (blueTd.attr('style') && blueTd.attr('style').includes('#ffffcc')) ? false : 
                           redCornerName.includes(fighterName.split(' ')[0]);

            let opponentName = isOwnerRed ? blueCornerName : redCornerName;
            let oppTh = containsThai(opponentName) ? opponentName : "";
            let oppEn = containsThai(opponentName) ? "" : opponentName;

            let redResult = "Draw";
            if (rawResultBtn.includes('ชนะ')) redResult = "Win";
            else if (rawResultBtn.includes('แพ้')) redResult = "Loss";

            let finalFightResult = "Draw";
            if (redResult === "Win") finalFightResult = isOwnerRed ? "Win" : "Loss";
            else if (redResult === "Loss") finalFightResult = isOwnerRed ? "Loss" : "Win";

            let fightMethod = "Decision", fightRound = 3;
            if (rawResultBtn.includes('น็อก') || rawResultBtn.includes('KO') || rawResultBtn.includes('TKO')) {
                fightMethod = "KO/TKO";
            }
            const roundMatch = rawResultBtn.match(/ยก\s*(\d+)/);
            if (roundMatch) fightRound = parseInt(roundMatch[1], 10);

            fighterData[historyKey].push({
                result: finalFightResult, discipline_en: "Muay Thai", method_en: fightMethod, round: fightRound, time: "N/A",
                opponent_th: oppTh, opponent_en: oppEn, opponent_country: "Thailand", date: formattedDate, rating: 5, event_en: eventName
            });
            addedCount++;
        }
    } catch (error) {
        console.error(`      ❌ [THBoxing] ดึงข้อมูลล้มเหลว:`, error.message);
    }
    return { addedCount, profileUpdated: false };
}

// ==========================================================================
// 🛸 MODULE 2: ดึงข้อมูลจากยานแม่ ONE FC
// ==========================================================================
async function scrapeOneFc(page, url, fighterData, fighterName, historyKey) {
    let addedCount = 0;
    let profileUpdated = false; 

    let fetchUrl = url;
    if (fetchUrl.includes('onefc.com/athletes/') && !fetchUrl.includes('/th/athletes/')) {
        fetchUrl = fetchUrl.replace('.com/athletes/', '.com/th/athletes/');
    }

    try {
        await page.goto(fetchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await delay(3000); 

        let hasMore = true, clickCount = 0, maxClicks = 50;
        while (hasMore && clickCount < maxClicks) {
            hasMore = await page.evaluate(() => {
                window.scrollBy(0, 500);
                const loadBtn = Array.from(document.querySelectorAll('a, button')).find(el => {
                    const text = (el.innerText || el.textContent || '').toLowerCase();
                    return (text.includes('แสดงเพิ่มเติม') || text.includes('load more')) && el.offsetParent !== null;
                });
                if (loadBtn) { loadBtn.click(); return true; }
                return false;
            });
            if (hasMore) { clickCount++; await delay(2000); }
        }

        const content = await page.content();
        const $ = cheerio.load(content);
        
        const profile = fighterData.fighter_profile;
        if (!profile.personal_info) profile.personal_info = {};
        if (!profile.physical_stats) profile.physical_stats = {};
        
        const personal = profile.personal_info;
        const physical = profile.physical_stats;
        const fullText = $('body').text().replace(/\s+/g, ' '); 

        if (!personal.age || personal.age === 0) {
            const ageMatch = fullText.match(/อายุ\s*(\d+)/);
            if (ageMatch) { personal.age = parseInt(ageMatch[1], 10); profileUpdated = true; }
        }

        if (!physical.height_cm || physical.height_cm === 0) {
            const heightMatch = fullText.match(/(\d+)\s*(?:ซม\.|ซม)/);
            if (heightMatch) { physical.height_cm = parseInt(heightMatch[1], 10); profileUpdated = true; }
        }

        if (!personal.country_th || personal.country_th === "ยังไม่มีข้อมูล" || personal.country_th.length <= 2) {
            const countryMatch = fullText.match(/ประเทศ\s+(.*?)\s+อายุ/);
            if (countryMatch) {
                personal.country_th = countryMatch[1].trim();
                personal.country_en = mapCountryToEnglish(personal.country_th);
                profileUpdated = true;
            }
        }

        // 4. ตรวจสอบและอัปเดต "ทีม" (อัปเกรด Regex ให้รองรับสระและวรรณยุกต์ไทย \u0E00-\u0E7F)
        if (!personal.team_th || personal.team_th === "ยังไม่มีข้อมูล" || personal.team_th === "ไม่ระบุ") {
            const teamMatch = fullText.match(/ทีม\s+([A-Za-z\u0E00-\u0E7F0-9\s\.\-\/]{2,50}?)(?=\s+(?:การเดินทาง|ประวัติ|สถิติ|ผล|แชร์|ติดตาม|รายการ|ข่าว|วิดีโอ|อ่านเพิ่มเติม|ONE|นักกีฬา|อายุ|ประเทศ|น้ำหนัก|ส่วนสูง)|$)/);
            if (teamMatch && teamMatch[1].trim().length > 0) {
                personal.team_th = teamMatch[1].trim();
                personal.team_en = mapCountryToEnglish(personal.team_th); 
                profileUpdated = true;
                console.log(`      🏢 เจอค่าย/ทีมแล้ว: ${personal.team_th}`);
            }
        }

        const fightRows = $('table.simple-table.is-mobile-row-popup tr.is-data-row, table tr.is-data-row');

        if (fightRows.length > 0) {
            fightRows.each((index, element) => {
                const rawResult = $(element).find('td.result .is-distinct').first().text().trim();
                let result = "Draw";
                if (rawResult.includes("ชนะ") || rawResult.toLowerCase() === "win") result = "Win";
                else if (rawResult.includes("แพ้") || rawResult.toLowerCase() === "loss") result = "Loss";

                let discipline = $(element).find('td.sport').first().text().trim();
                if (discipline.includes("มวยไทย") || discipline.includes("Muay Thai")) discipline = "Muay Thai";
                else if (discipline.includes("คิกบ็อกซิ่ง") || discipline.includes("Kickboxing")) discipline = "Kickboxing";
                else if (discipline.includes("ผสมผสาน") || discipline.includes("MMA")) discipline = "MMA";

                const rawMethod = $(element).find('td.method').contents().first().text().trim();
                let method = "Decision";
                if (rawMethod.includes('น็อกเอาต์') || rawMethod.includes('KO')) method = "KO/TKO";
                else if (rawMethod.includes('ซับมิชชัน') || rawMethod.includes('Submission')) method = "Submission";
                else if (rawMethod.includes('เอกฉันท์') || rawMethod.includes('Unanimous')) method = "Unanimous Decision";
                else if (rawMethod.includes('ไม่เอกฉันท์') || rawMethod.includes('Split')) method = "Split Decision";

                const rawRoundTime = $(element).find('td.round').first().text().trim();
                let round = 3, time = "N/A";
                const roundMatch = rawRoundTime.match(/(?:ยก|R)\s*(\d+)/i);
                if (roundMatch) round = parseInt(roundMatch[1], 10);
                const timeMatch = rawRoundTime.match(/\((.*?)\)/);
                if (timeMatch) time = timeMatch[1].trim();

                const opponent = $(element).find('td.opponent h5.fs-100').first().text().trim();
                const opponentCountry = mapCountryToEnglish($(element).find('td.opponent .opponent-country').first().text().trim() || "ไม่ระบุ");
                
                let oppTh = containsThai(opponent) ? opponent : "";
                let oppEn = containsThai(opponent) ? "" : opponent;

                const rawDate = $(element).find('td.date').first().text().trim();
                const formattedDate = parseOneFcDate(rawDate);
                
                let eventName = $(element).find('td.event h5.fs-100').first().text().trim();
                if (eventName && !eventName.toUpperCase().includes('ONE')) eventName = 'ONE ' + eventName;

                if (opponent && formattedDate) {
                    const scrapedDateObj = new Date(formattedDate);
                    const isDuplicate = fighterData[historyKey].some(existingFight => {
                        const existingDateObj = new Date(existingFight.date);
                        if (isNaN(existingDateObj) || isNaN(scrapedDateObj)) return false; 
                        const diffTime = Math.abs(scrapedDateObj - existingDateObj);
                        if ((diffTime / (1000 * 60 * 60 * 24)) <= 2) return true;
                        
                        const isSameOpponent = (existingFight.opponent_th === opponent || existingFight.opponent_en === opponent);
                        if (isSameOpponent && existingFight.round === round && existingFight.time === time) return true;
                        return false; 
                    });

                    if (!isDuplicate) {
                        fighterData[historyKey].push({
                            result, discipline_en: discipline, method_en: method, round, time,
                            opponent_th: oppTh, opponent_en: oppEn, opponent_country: opponentCountry,
                            date: formattedDate, rating: 5, event_en: eventName
                        });
                        addedCount++;
                        console.log(`      ➕ เพิ่มประวัติ: ${result} เจอกับ ${opponent} (${formattedDate})`);
                    }
                }
            });
        }
    } catch (error) {
        console.error(`      ❌ [ONE FC] เจาะข้อมูลล้มเหลว:`, error.message);
    }
    
    return { addedCount, profileUpdated };
}

// ==========================================================================
// 🚀 MAIN SYSTEM (ระบบจ่ายงานศูนย์กลาง)
// ==========================================================================
async function runMultiSourceScraper() {
    console.log('🤖 บอล (Bot): ระบบ Multi-Source สตาร์ทเครื่อง!');

    const browser = await puppeteer.launch({
        headless: "new",   
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    try {
        const files = fs.readdirSync(dataFolder).filter(file => file.endsWith('.json'));
        let totalFilesUpdated = 0;

        for (let i = 0; i < files.length; i++) {
            const filePath = path.join(dataFolder, files[i]);
            let fighterData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            if (!fighterData.fighter_profile) continue;

            const fighterName = fighterData.fighter_profile.name_th;
            const historyKey = 'fight_history';
            let jsonNeedsStructureUpdate = false;

            const profile = fighterData.fighter_profile;
            
            // 🌟 1. ดึงชื่อภาษาอังกฤษอัตโนมัติจากลิงก์ URL (ตามไอเดียของคุณ)
            if (!profile.name_en || profile.name_en.trim() === "" || profile.name_en === "ไม่ระบุ") {
                let targetUrl = (profile.target_urls && profile.target_urls.length > 0) ? profile.target_urls[0] : profile.target_url;
                if (targetUrl) {
                    const slugMatch = targetUrl.match(/\/athletes\/([^\/]+)/);
                    if (slugMatch && slugMatch[1]) {
                        // แปลง batochir-batsaikhan -> Batochir Batsaikhan
                        const englishName = slugMatch[1].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                        profile.name_en = englishName;
                        jsonNeedsStructureUpdate = true;
                        console.log(`      📝 [Auto-Name] สร้างชื่อภาษาอังกฤษสำเร็จ: ${englishName}`);
                    }
                }
            }

            // 🧹 2. Auto-Heal ล้างข้อมูลวันที่พัง (NaN)
            if (fighterData[historyKey]) {
                const originalLength = fighterData[historyKey].length;
                fighterData[historyKey] = fighterData[historyKey].filter(fight => fight.date && !fight.date.includes("NaN"));
                
                let uniqueFights = [], seenDates = new Set();
                for (let f of fighterData[historyKey]) {
                    if (f.date && f.date.trim() !== "") {
                        if (!seenDates.has(f.date)) { uniqueFights.push(f); seenDates.add(f.date); }
                    } else {
                        uniqueFights.push(f); 
                    }
                }
                fighterData[historyKey] = uniqueFights;

                if (fighterData[historyKey].length !== originalLength) {
                    jsonNeedsStructureUpdate = true;
                    console.log(`      🧹 [Auto-Heal] ล้างประวัติพัง/ซ้ำซ้อนให้ ${fighterName} เรียบร้อย!`);
                }
            }

            let urlsToScrape = [];
            if (Array.isArray(fighterData.fighter_profile.target_urls) && fighterData.fighter_profile.target_urls.length > 0) {
                urlsToScrape = fighterData.fighter_profile.target_urls;
            } else if (fighterData.fighter_profile.target_url) {
                urlsToScrape = [fighterData.fighter_profile.target_url];
                fighterData.fighter_profile.target_urls = urlsToScrape;
                delete fighterData.fighter_profile.target_url;
                jsonNeedsStructureUpdate = true;
            }

            if (urlsToScrape.length === 0 && !jsonNeedsStructureUpdate) continue;

            let totalAddedForFighter = 0;
            let profileUpdatedForFighter = false; 

            if(urlsToScrape.length > 0) console.log(`\n⏳ กำลังสแกนข้อมูลของ: ${fighterName}`);

            for (const url of urlsToScrape) {
                if (!url) continue;
                if (url.includes('thboxing.com')) {
                    const res = await scrapeThboxing(url, fighterData, fighterName, historyKey);
                    totalAddedForFighter += res.addedCount;
                    if (res.profileUpdated) profileUpdatedForFighter = true;
                } else if (url.includes('onefc.com')) {
                    const res = await scrapeOneFc(page, url, fighterData, fighterName, historyKey);
                    totalAddedForFighter += res.addedCount;
                    if (res.profileUpdated) profileUpdatedForFighter = true;
                }
                await delay(1000); 
            }

            // ถ้าระบบมีการสกัดชื่อ Eng, จัดระเบียบลิงก์, หรือเพิ่มข้อมูลใหม่ จะทำการบันทึก
            if (totalAddedForFighter > 0 || jsonNeedsStructureUpdate || profileUpdatedForFighter) {
                fighterData[historyKey].sort((a, b) => new Date(b.date) - new Date(a.date));
                fs.writeFileSync(filePath, JSON.stringify(fighterData, null, 2), 'utf-8');
                totalFilesUpdated++;
                if (totalAddedForFighter === 0) console.log(`      💾 จัดระเบียบไฟล์และอัปเดตโปรไฟล์สำเร็จ!`);
            }
        }

        console.log(`\n🤖 ปฏิบัติการเสร็จสิ้น! อัปเดตฐานข้อมูลไป ${totalFilesUpdated} รายการ`);

        if (totalFilesUpdated > 0) {
            try {
                if (fs.existsSync(generateScriptPath)) execSync(`node "${generateScriptPath}"`, { stdio: 'inherit' });
                if (fs.existsSync(generateListPath)) execSync(`node "${generateListPath}"`, { stdio: 'inherit' });
            } catch (err) {}
        }

    } catch (e) {
        console.error('🚨 ขัดข้องระบบศูนย์กลาง:', e);
    } finally {
        await browser.close();
    }
}

runMultiSourceScraper();
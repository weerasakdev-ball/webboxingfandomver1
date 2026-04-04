const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const { execSync } = require('child_process');

// ==========================================================================
// ⚙️ อัปเดต Path สำหรับโปรเจกต์ใหม่
// ==========================================================================
const dataFolder = path.join(__dirname, 'data', 'boxers');
const generateScriptPath = path.join(__dirname, 'generate-fighters.js');
const generateListPath = path.join(__dirname, 'generate-list.js'); // ➕ ไฟล์ดัชนีรายชื่อนักมวย

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================================================
// 🛠️ UTILITY FUNCTIONS (ฟังก์ชันแปลงวันที่ของแต่ละเว็บ)
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

function parseOneFcDate(thaiDateString) {
    if (!thaiDateString) return null;
    let cleanStr = thaiDateString.trim().replace(/\s+/g, ' ');
    const parts = cleanStr.split(' ');
    
    if (parts.length >= 3) {
        let day = parseInt(parts[0], 10).toString().padStart(2, '0'); 
        const thaiMonth = parts[1];
        const year = parts[2]; 
        
        const monthMap = {
            "ม.ค.": "Jan", "ก.พ.": "Feb", "มี.ค.": "Mar", "เม.ย.": "Apr", "พ.ค.": "May", "มิ.ย.": "Jun",
            "ก.ค.": "Jul", "ส.ค.": "Aug", "ก.ย.": "Sep", "ต.ค.": "Oct", "พ.ย.": "Nov", "ธ.ค.": "Dec",
            "มกราคม": "Jan", "กุมภาพันธ์": "Feb", "มีนาคม": "Mar", "เมษายน": "Apr", "พฤษภาคม": "May", "มิถุนายน": "Jun",
            "กรกฎาคม": "Jul", "สิงหาคม": "Aug", "กันยายน": "Sep", "ตุลาคม": "Oct", "พฤศจิกายน": "Nov", "ธันวาคม": "Dec"
        };
        
        const engMonth = monthMap[thaiMonth] || thaiMonth;
        return `${engMonth} ${day}, ${year}`;
    }
    return thaiDateString;
}

// ==========================================================================
// 🥊 MODULE 1: ดึงข้อมูลจาก THBOXING
// ==========================================================================
async function scrapeThboxing(url, fighterData, fighterName, historyKey) {
    let addedCount = 0;
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 10000
        });
        
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

            const isRedHighlighted = redTd.attr('style') && redTd.attr('style').includes('#ffffcc');
            const isBlueHighlighted = blueTd.attr('style') && blueTd.attr('style').includes('#ffffcc');
            
            let isOwnerRed = false;
            if (isRedHighlighted) isOwnerRed = true;
            else if (isBlueHighlighted) isOwnerRed = false;
            else isOwnerRed = redCornerName.includes(fighterName.split(' ')[0]);

            let opponentName = isOwnerRed ? blueCornerName : redCornerName;

            let redResult = "Draw";
            if (rawResultBtn.includes('ชนะ')) redResult = "Win";
            else if (rawResultBtn.includes('แพ้')) redResult = "Loss";

            let finalFightResult = "Draw";
            if (redResult === "Win") finalFightResult = isOwnerRed ? "Win" : "Loss";
            else if (redResult === "Loss") finalFightResult = isOwnerRed ? "Loss" : "Win";

            let fightMethod = "Decision";
            let fightRound = 3;

            if (rawResultBtn.includes('น็อก') || rawResultBtn.includes('น๊อก') || rawResultBtn.includes('KO') || rawResultBtn.includes('TKO')) {
                fightMethod = "KO/TKO";
                const roundMatch = rawResultBtn.match(/ยก\s*(\d+)/);
                if (roundMatch) fightRound = parseInt(roundMatch[1], 10);
            } else if (rawResultBtn.includes('คะแนน')) {
                const roundMatch = rawResultBtn.match(/ยก\s*(\d+)/);
                if (roundMatch) {
                    let tempRound = parseInt(roundMatch[1], 10);
                    if (tempRound < 3) {
                        fightMethod = "KO/TKO";
                        fightRound = tempRound;
                    } else {
                        fightMethod = "Decision";
                        fightRound = tempRound;
                    }
                }
            } else {
                const roundMatch = rawResultBtn.match(/ยก\s*(\d+)/);
                if (roundMatch) {
                    fightRound = parseInt(roundMatch[1], 10);
                    if (fightRound < 3) fightMethod = "KO/TKO";
                }
            }

            fighterData[historyKey].push({
                result: finalFightResult,
                discipline_en: "Muay Thai",
                method_en: fightMethod,
                round: fightRound,
                time: "N/A",
                opponent_th: opponentName,
                opponent_en: "",
                opponent_country: "Thailand", 
                date: formattedDate,
                rating: 5, 
                event_en: eventName
            });
            addedCount++;
            console.log(`      ➕ [THBoxing] ${finalFightResult} by ${fightMethod} เจอกับ ${opponentName} (${formattedDate})`);
        }
    } catch (error) {
        console.error(`      ❌ [THBoxing] ดึงข้อมูลล้มเหลว:`, error.message);
    }
    return addedCount;
}

// ==========================================================================
// 🛸 MODULE 2: ดึงข้อมูลจากยานแม่ ONE FC
// ==========================================================================
async function scrapeOneFc(page, url, fighterData, fighterName, historyKey) {
    let addedCount = 0;
    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await delay(3000); 

        console.log(`      🔍 กำลังตรวจสอบประวัติการชกที่ซ่อนอยู่...`);
        let hasMore = true;
        let clickCount = 0;
        const maxClicks = 50;

        while (hasMore && clickCount < maxClicks) {
            hasMore = await page.evaluate(() => {
                window.scrollBy(0, 500);
                const elements = Array.from(document.querySelectorAll('a, button'));
                const loadBtn = elements.find(el => {
                    const text = (el.innerText || el.textContent || '').toLowerCase();
                    return (text.includes('แสดงเพิ่มเติม') || text.includes('load more')) && el.offsetParent !== null;
                });

                if (loadBtn) {
                    loadBtn.click();
                    return true;
                }
                return false;
            });

            if (hasMore) {
                clickCount++;
                console.log(`      👆 กดปุ่ม 'แสดงเพิ่มเติม' ครั้งที่ ${clickCount}...`);
                await delay(2000); 
            }
        }

        if (clickCount > 0) {
            console.log(`      ✅ เปิดประวัติที่ซ่อนอยู่ทั้งหมดสำเร็จ!`);
        }

        const content = await page.content();
        const $ = cheerio.load(content);
        
        const fightRows = $('table.simple-table.is-mobile-row-popup tr.is-data-row, table tr.is-data-row');

        if (fightRows.length > 0) {
            fightRows.each((index, element) => {
                
                const rawResult = $(element).find('td.result .is-distinct').first().text().trim();
                let result = "Draw";
                if (rawResult === "ชนะ") result = "Win";
                else if (rawResult === "แพ้") result = "Loss";

                let discipline = $(element).find('td.sport').first().text().trim();
                if (discipline === "มวยไทย") discipline = "Muay Thai";
                else if (discipline === "คิกบ็อกซิ่ง") discipline = "Kickboxing";
                else if (discipline === "การต่อสู้แบบผสมผสาน") discipline = "MMA";
                else if (discipline === "ปล้ำจับล็อก") discipline = "Submission Grappling";

                const rawMethod = $(element).find('td.method').contents().first().text().trim();
                let method = "Decision";
                if (rawMethod.includes('น็อกเอาต์') || rawMethod.includes('ทีเคโอ')) method = "KO/TKO";
                else if (rawMethod.includes('ซับมิชชัน') || rawMethod.includes('ล็อก')) method = "Submission";
                else if (rawMethod.includes('คะแนนเอกฉันท์')) method = "Unanimous Decision";
                else if (rawMethod.includes('คะแนนไม่เอกฉันท์')) method = "Split Decision";
                else if (rawMethod.includes('คะแนนเสียงข้างมาก')) method = "Majority Decision";

                const rawRoundTime = $(element).find('td.round').first().text().trim();
                let round = 3;
                let time = "N/A";
                const roundMatch = rawRoundTime.match(/ยก\s*(\d+)/);
                if (roundMatch) round = parseInt(roundMatch[1], 10);
                const timeMatch = rawRoundTime.match(/\((.*?)\)/);
                if (timeMatch) time = timeMatch[1].trim();

                const opponent = $(element).find('td.opponent h5.fs-100').first().text().trim();
                const opponentCountry = $(element).find('td.opponent .opponent-country').first().text().trim() || "ไม่ระบุ";
                
                const rawDate = $(element).find('td.date').first().text().trim();
                const formattedDate = parseOneFcDate(rawDate);
                
                let eventName = $(element).find('td.event h5.fs-100').first().text().trim();
                if (eventName && !eventName.toUpperCase().includes('ONE')) {
                    eventName = 'ONE ' + eventName;
                }

                if (opponent && formattedDate) {
                    const scrapedDateObj = new Date(formattedDate);
                    const isDuplicate = fighterData[historyKey].some(existingFight => {
                        const existingDateObj = new Date(existingFight.date);
                        if (isNaN(existingDateObj)) return false; 
                        const diffTime = Math.abs(scrapedDateObj - existingDateObj);
                        return (diffTime / (1000 * 60 * 60 * 24)) <= 2; 
                    });

                    if (!isDuplicate) {
                        fighterData[historyKey].push({
                            result: result,
                            discipline_en: discipline,
                            method_en: method,
                            round: round,
                            time: time,
                            opponent_th: opponent,
                            opponent_en: "", 
                            opponent_country: opponentCountry,
                            date: formattedDate,
                            rating: 5, 
                            event_en: eventName
                        });
                        addedCount++;
                        console.log(`      ➕ [ONE FC] ${result} by ${method} เจอกับ ${opponent} (${formattedDate})`);
                    }
                }
            });
        }
    } catch (error) {
        console.error(`      ❌ [ONE FC] เจาะข้อมูลล้มเหลว:`, error.message);
    }
    return addedCount;
}

// ==========================================================================
// 🚀 MAIN SYSTEM (ระบบจ่ายงานศูนย์กลาง)
// ==========================================================================
async function runMultiSourceScraper() {
    console.log('🤖 บอล (Bot): ระบบ Multi-Source สตาร์ทเครื่อง! พร้อมสูบข้อมูลจากทุกสารทิศ...');

    const browser = await puppeteer.launch({
        headless: "new",   
        defaultViewport: { width: 1920, height: 1080 }, 
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=1920,1080'
        ]
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        if (!fs.existsSync(dataFolder)) {
            console.error(`❌ ไม่พบโฟลเดอร์ ${dataFolder} ครับ`);
            return;
        }

        const files = fs.readdirSync(dataFolder).filter(file => file.endsWith('.json'));
        let totalFilesUpdated = 0;

        for (let i = 0; i < files.length; i++) {
            const fileName = files[i];
            const filePath = path.join(dataFolder, fileName);
            
            let fighterData;
            try {
                fighterData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            } catch (e) {
                continue;
            }

            if (!fighterData.fighter_profile) continue;

            const fighterName = fighterData.fighter_profile.name_th;
            let urlsToScrape = [];
            let jsonNeedsStructureUpdate = false;

            // ==========================================================================
            // 🛠️ ส่วนที่แก้ไข: ตรวจสอบและดึงลิงก์ให้ฉลาดขึ้น
            // การทำงาน: 
            // 1. เช็กว่า target_urls เป็น Array และมีข้อมูลอยู่ข้างในหรือไม่ ถ้ามีให้ใช้ค่าจาก target_urls
            // 2. ถ้าข้อแรกไม่จริง ให้มาเช็กที่ target_url ว่ามีลิงก์อยู่หรือไม่ ถ้ามีให้ดึงมาใช้แล้วแปลงลง target_urls
            // ==========================================================================
            if (Array.isArray(fighterData.fighter_profile.target_urls) && fighterData.fighter_profile.target_urls.length > 0) {
                urlsToScrape = fighterData.fighter_profile.target_urls;
            } else if (fighterData.fighter_profile.target_url && fighterData.fighter_profile.target_url.trim() !== "") {
                urlsToScrape = [fighterData.fighter_profile.target_url];
                fighterData.fighter_profile.target_urls = urlsToScrape;
                delete fighterData.fighter_profile.target_url;
                jsonNeedsStructureUpdate = true;
            }
            // ==========================================================================

            if (urlsToScrape.length === 0) continue;

            const historyKey = 'fight_history';
            if (!fighterData[historyKey]) fighterData[historyKey] = [];

            let totalAddedForFighter = 0;
            console.log(`\n⏳ กำลังสแกนข้อมูลของ: ${fighterName} (จาก ${urlsToScrape.length} แหล่ง)`);

            for (const url of urlsToScrape) {
                if (!url || url.trim() === "") continue;

                if (url.includes('thboxing.com') || url.includes('thaibozing.com')) {
                    totalAddedForFighter += await scrapeThboxing(url, fighterData, fighterName, historyKey);
                } 
                else if (url.includes('onefc.com')) {
                    totalAddedForFighter += await scrapeOneFc(page, url, fighterData, fighterName, historyKey);
                }

                await delay(1500); 
            }

            if (totalAddedForFighter > 0 || jsonNeedsStructureUpdate) {
                fighterData[historyKey].sort((a, b) => new Date(b.date) - new Date(a.date));
                fs.writeFileSync(filePath, JSON.stringify(fighterData, null, 2), 'utf-8');
                
                if (totalAddedForFighter > 0) {
                    console.log(`  💾 เซฟสำเร็จ! (เพิ่มประวัติให้ ${fighterName} จำนวน ${totalAddedForFighter} ไฟต์)`);
                } else {
                    console.log(`  💾 จัดระเบียบลิงก์เป้าหมายสำเร็จ`);
                }
                totalFilesUpdated++;
            } else {
                console.log(`  ✅ ประวัติอัปเดตล่าสุดอยู่แล้วครับ!`);
            }
        }

        console.log(`\n🤖 ปฏิบัติการกวาดข้อมูลอัจฉริยะเสร็จสิ้น! (มีการอัปเดตฐานข้อมูลไป ${totalFilesUpdated} รายการ)`);

        // ==========================================================================
        // 🔄 ส่วนงานประกอบร่างหน้าเว็บ (รันเสมอถ้ามีการอัปเดต)
        // ==========================================================================
        if (totalFilesUpdated > 0) {
            console.log('\n⚙️ กำลังสั่งงาน Generator ประกอบร่างระบบ...');
            try {
                // 1. สร้างหน้าเว็บนักมวยรายบุคคล
                if (fs.existsSync(generateScriptPath)) {
                    console.log('📄 กำลังสร้างหน้าเว็บ HTML ของนักมวย...');
                    execSync(`node "${generateScriptPath}"`, { stdio: 'inherit' });
                }

                // 2. ➕ อัปเดตรายชื่อนักมวยเข้าสู่ระบบค้นหา (Search Index)
                if (fs.existsSync(generateListPath)) {
                    console.log('🔍 กำลังอัปเดตรายชื่อนักมวยเข้าสู่ระบบค้นหา...');
                    execSync(`node "${generateListPath}"`, { stdio: 'inherit' });
                }
            } catch (execErr) {
                console.error('❌ Generator ทำงานพลาด:', execErr.message);
            }
        }

    } catch (mainError) {
        console.error('🚨 ขัดข้องระบบศูนย์กลาง:', mainError);
    } finally {
        await browser.close();
    }
}

runMultiSourceScraper();
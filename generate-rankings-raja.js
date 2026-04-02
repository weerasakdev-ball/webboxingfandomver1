const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// 1. ตั้งค่าโฟลเดอร์เก็บข้อมูล
// ตรงนี้ทำงาน: สร้างที่อยู่สำหรับจัดเก็บไฟล์ JSON หากไม่มีโฟลเดอร์นี้ระบบจะสร้างให้ใหม่
const OUTPUT_DIR = path.join(__dirname, 'data', 'rankings', 'raja');
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 2. รายชื่อรุ่นน้ำหนักทั้งหมดของราชดำเนิน
// ตรงนี้ทำงาน: เป็นตัวกำหนดว่าบ็อตจะต้องวิ่งไปดึงข้อมูลกี่รุ่น และมีรุ่นอะไรบ้าง
const weightClasses = [
    "Middleweight",
    "Super Welterweight",
    "Welterweight",
    "Super Lightweight",
    "Lightweight",
    "Super Featherweight",
    "Featherweight",
    "Super Bantamweight",
    "Bantamweight",
    "Super Flyweight",
    "Flyweight",
    "Light Flyweight",
    "Minimumweight",
    "Female Bantamweight",
    "Female Flyweight",
    "Female Minimumweight"
];


async function scrapeAllDivisions() {
    console.log('🤖 เปิดการทำงานบ็อต (Puppeteer)...');
    
    // ตรงนี้ทำงาน: เปิดหน้าต่างจำลองของเว็บ (headless: true คือรันแบบซ่อนหน้าจอ)
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // 3. วนลูปดึงข้อมูลทีละรุ่น
    for (const weight of weightClasses) {
        try {
            // แปลงชื่อรุ่นให้เป็น URL ที่ถูกต้อง
            const queryParam = encodeURIComponent(weight).replace(/%20/g, '+');
            const targetUrl = `https://rank.rajadamnern.com/rankings?weight=${queryParam}`;

            console.log(`\n⏳ กำลังดึงข้อมูลรุ่น: ${weight}...`);
            await page.goto(targetUrl, { waitUntil: 'networkidle2' });

            // 4. สั่งให้บ็อตอ่านข้อมูลจากหน้าเว็บที่แสดงผลอยู่
            const fightersData = await page.evaluate(() => {
                const results = [];
                const seenNames = new Set(); // ตัวป้องกันชื่อซ้ำ

                // ==========================================
                // ภารกิจที่ 1: ตามหา "แชมป์เปี้ยน (Champion)" ในส่วน Banner
                // ==========================================
                // แชมป์จะอยู่ในคลาส .text-[3.125rem] หรือ h2 ใน Banner
                const champNameEl = document.querySelector('h2.text-\\[3\\.125rem\\], #Banner h2');
                
                if (champNameEl) {
                    const champName = champNameEl.innerText.trim();
                    if (champName && !seenNames.has(champName)) {
                        seenNames.add(champName);

                        // หาสัญชาติของแชมป์
                        let champCountry = '';
                        const champContainer = champNameEl.closest('div.flex-col') || document.querySelector('#Banner');
                        if (champContainer) {
                            const flagEl = champContainer.querySelector('.fi');
                            if (flagEl) {
                                const fiClass = Array.from(flagEl.classList).find(c => c.startsWith('fi-'));
                                if (fiClass) champCountry = fiClass.replace('fi-', '').toUpperCase();
                            }
                        }

                        results.push({
                            rank: "C",
                            name: champName,
                            image_url: "",
                            country: champCountry
                        });
                    }
                }

                // ==========================================
                // ภารกิจที่ 2: ดึงอันดับ 1-15 จากตารางจัดอันดับ (หลีกเลี่ยง Recent Fights)
                // ==========================================
                // เจาะจงไปที่ #fighterList เท่านั้น จะได้ไม่ไปดึงคู่ชกใน Banner มามั่ว
                const rankingList = document.querySelector('#fighterList');
                if (rankingList) {
                    const fighterRows = rankingList.querySelectorAll('a[href^="/fighters/"]');

                    fighterRows.forEach(row => {
                        // ดึงชื่อ
                        const nameEl = row.querySelector('h1.truncate') || row.querySelector('h1:not(.w-5 h1)');
                        const name = nameEl ? nameEl.innerText.trim() : '';

                        // ถ้าไม่มีชื่อ หรือชื่อซ้ำ ให้ข้าม
                        if (!name || seenNames.has(name)) return;
                        seenNames.add(name);

                        // ดึงอันดับ (IC, 1, 2, 3...)
                        const rankEl = row.querySelector('.w-5 h1');
                        const rank = rankEl ? rankEl.innerText.trim() : '';

                        // ดึงสัญชาติ
                        let countryCode = '';
                        const flagEl = row.querySelector('.fi');
                        if (flagEl) {
                            const fiClass = Array.from(flagEl.classList).find(c => c.startsWith('fi-'));
                            if (fiClass) countryCode = fiClass.replace('fi-', '').toUpperCase();
                        }

                        results.push({
                            rank: rank,
                            name: name,
                            image_url: "",
                            country: countryCode
                        });
                    });
                }

                return results;
            });


            


            // 5. บันทึกข้อมูลเป็น JSON
            // ตรงนี้ทำงาน: นำข้อมูลที่สกัดได้ มาจัดเรียงและเขียนลงไฟล์นามสกุล .json แยกตามรุ่น
            if (fightersData.length > 0) {
                const fileName = weight.toLowerCase().replace(/\s+/g, '-') + '.json';
                const filePath = path.join(OUTPUT_DIR, fileName);

                const finalOutput = {
                    last_updated: new Date().toISOString(),
                    stadium: "Rajadamnern Stadium",
                    division: weight,
                    fighters: fightersData
                };

                fs.writeFileSync(filePath, JSON.stringify(finalOutput, null, 2));
                console.log(`✅ บันทึกไฟล์ ${fileName} สำเร็จ! (พบนักมวย ${fightersData.length} คน)`);
            } else {
                console.log(`⚠️ ไม่พบข้อมูลนักมวยในรุ่น ${weight}`);
            }

            // ตรงนี้ทำงาน: หน่วงเวลา 1.5 วินาทีก่อนไปดึงรุ่นต่อไป เพื่อไม่ให้เซิร์ฟเวอร์ปลายทางมองว่าเราเป็น Spam
            await new Promise(resolve => setTimeout(resolve, 1500));

        } catch (err) {
            console.error(`❌ ดึงข้อมูลรุ่น ${weight} ไม่สำเร็จ:`, err.message);
        }
    }


    console.log('\n✨ ดึงข้อมูลครบทุกรุ่นแล้ว! ปิดเบราว์เซอร์...');
    
    // 6. ปิดการทำงานของเบราว์เซอร์จำลอง
    await browser.close();
}

// เรียกใช้งานฟังก์ชัน
scrapeAllDivisions();
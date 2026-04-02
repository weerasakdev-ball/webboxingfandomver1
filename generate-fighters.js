const fs = require('fs');
const path = require('path');

// 1. กำหนดโฟลเดอร์ต้นทาง (ข้อมูล JSON) และไฟล์แม่แบบ (template.html)
const dataDir = path.join(__dirname, 'data', 'boxers');
const templatePath = path.join(__dirname, 'pages', 'fighter', 'template.html');

// 2. กำหนดโฟลเดอร์ปลายทางสำหรับเก็บไฟล์ HTML ที่เสกออกมา
const outputDir = path.join(__dirname, 'pages', 'fighter');

// ตรวจสอบความพร้อมของโฟลเดอร์และไฟล์
if (!fs.existsSync(dataDir)) {
    console.error("❌ ไม่พบโฟลเดอร์ 'data/boxers'");
    process.exit(1);
}
if (!fs.existsSync(templatePath)) {
    console.error("❌ ไม่พบไฟล์ต้นแบบ 'pages/fighter/template.html' (กรุณาเปลี่ยนชื่อไฟล์ profile.html เป็น template.html)");
    process.exit(1);
}

// 3. อ่านโค้ดจากไฟล์ต้นแบบ
const templateHtml = fs.readFileSync(templatePath, 'utf8');

// 4. ดึงรายชื่อไฟล์ JSON ทั้งหมด (ยกเว้น fighters-list.json)
const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && f !== 'fighters-list.json');

if (files.length === 0) {
    console.log("⚠️ ไม่พบไฟล์ .json ข้อมูลนักมวยในโฟลเดอร์ data/boxers");
    process.exit(0);
}

console.log(`🚀 กำลังเสกหน้าเว็บ HTML แยกสำหรับนักมวยทั้งหมด ${files.length} คน ลงในโฟลเดอร์ pages/fighter/...`);

let successCount = 0;

// 5. วนลูปสร้างไฟล์ HTML
files.forEach(file => {
    const fighterName = file.replace('.json', ''); // ตัดนามสกุลออกเหลือแค่ชื่อ (เช่น rodtang)
    let outputHtml = templateHtml;
    
    // ก. ปรับ Title ให้ตรงกับชื่อไฟล์ (เดี๋ยว JS ในหน้าเว็บจะไปดึงชื่อภาษาไทยมาทับอีกทีตอนโหลดเพื่อความเป๊ะ)
    outputHtml = outputHtml.replace(
        /<title>.*<\/title>/,
        `<title>${fighterName} - ประวัตินักมวย | BoxingFandom</title>`
    );

    // ข. เปลี่ยนตัวแปรให้ล็อกชื่อไฟล์ JSON แทนการดึงจาก URL (ลบระบบ ?id= ออก)
    // ค้นหาบรรทัดที่ดึง URL Params และแทนที่ด้วยชื่อไฟล์ตรงๆ
    outputHtml = outputHtml.replace(
        /const urlParams = new URLSearchParams\(window\.location\.search\);[\s\S]*?let fileName = urlParams\.get\('id'\);[\s\S]*?if \(!fileName\) \{[\s\S]*?return;\s*\}/,
        `let fileName = "${file}"; // ล็อกชื่อไฟล์ JSON โดยตรงจากการรันสคริปต์เสกหน้าเว็บ`
    );

    // ค. แก้ลิงก์คู่ต่อสู้ให้ชี้ไปหาไฟล์ HTML แบบตรงๆ (ไม่ต้องใช้ ?id= แล้ว)
    outputHtml = outputHtml.split('href="profile.html?id=${encodeURIComponent(oppFileName.replace(\'.json\', \'\'))}"')
                           .join('href="${encodeURIComponent(oppFileName.replace(\'.json\', \'.html\'))}"');

    // 6. บันทึกไฟล์ลงในโฟลเดอร์ปลายทาง
    const outputPath = path.join(outputDir, `${fighterName}.html`);
    
    try {
        fs.writeFileSync(outputPath, outputHtml, 'utf8');
        successCount++;
        console.log(`✅ สร้าง/อัปเดตไฟล์: pages/fighter/${fighterName}.html`);
    } catch (err) {
        console.error(`❌ เกิดข้อผิดพลาดที่ไฟล์ ${fighterName}.html:`, err);
    }
});

console.log(`\n🎉 เสร็จสมบูรณ์! เสกไฟล์ HTML ทั้งหมด ${successCount} ไฟล์ เรียบร้อยแล้วครับบอส!`);
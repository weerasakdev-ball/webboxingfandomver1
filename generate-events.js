const fs = require('fs');
const path = require('path');

// 1. กำหนดเส้นทางโฟลเดอร์ข้อมูล และไฟล์แม่พิมพ์
const matchesDir = path.join(__dirname, 'data', 'matches');
const templatePath = path.join(__dirname, 'pages', 'analysis', 'template-event.html');
const outputDir = path.join(__dirname, 'pages', 'analysis');

if (!fs.existsSync(matchesDir)) { console.error("❌ ไม่พบโฟลเดอร์ 'data/matches'"); process.exit(1); }
if (!fs.existsSync(templatePath)) { console.error("❌ ไม่พบไฟล์แม่พิมพ์ 'pages/analysis/template-event.html'"); process.exit(1); }

const templateHtml = fs.readFileSync(templatePath, 'utf8');

// 2. กวาดหาไฟล์ JSON ทั้งหมดในโฟลเดอร์ matches (ยกเว้นไฟล์ events-list.json)
const files = fs.readdirSync(matchesDir).filter(f => f.endsWith('.json') && f !== 'events-list.json');

if (files.length === 0) { console.log("⚠️ ไม่พบไฟล์ข้อมูลศึก"); process.exit(0); }

console.log(`🚀 กำลังเสกหน้าเว็บวิเคราะห์มวย จำนวน ${files.length} ศึก...`);

let successCount = 0;

// 3. วนลูปสร้างหน้า HTML ตามจำนวนไฟล์ JSON ที่มี
files.forEach(file => {
    const eventId = file.replace('.json', ''); 
    let outputHtml = templateHtml;
    
    let eventName = eventId;
    try {
        const rawData = fs.readFileSync(path.join(matchesDir, file), 'utf8');
        const eventData = JSON.parse(rawData);
        eventName = eventData.event_name || eventId;
        const statusText = eventData.status === 'completed' ? '✅ สรุปผลมวย' : '🔥 วิเคราะห์มวย';
        outputHtml = outputHtml.replace(/<title>.*<\/title>/, `<title>${statusText}: ${eventName} | BoxingFandom</title>`);
    } catch(e) {}

    outputHtml = outputHtml.replace(/let eventFileName = ".*?";/, `let eventFileName = "${file}";`);

    const outputPath = path.join(outputDir, `${eventId}.html`);
    try {
        fs.writeFileSync(outputPath, outputHtml, 'utf8');
        successCount++;
    } catch (err) {
        console.error(`❌ เกิดข้อผิดพลาดที่ไฟล์ ${eventId}.html:`, err);
    }
});

// ==============================================================
// 🌟 4. จุดอัปเกรด: สร้างไฟล์ events-list.json อัตโนมัติ!
// ==============================================================
const listPath = path.join(matchesDir, 'events-list.json');
try {
    fs.writeFileSync(listPath, JSON.stringify(files, null, 2), 'utf8');
    console.log(`✅ สร้างไฟล์สารบัญศึกสำเร็จ: data/matches/events-list.json`);
} catch (err) {
    console.error(`❌ สร้างไฟล์สารบัญศึกไม่สำเร็จ:`, err);
}

console.log(`\n🎉 ปิดจ๊อบ! ผลิตหน้าวิเคราะห์เสร็จสมบูรณ์ทั้งหมด ${successCount} หน้าครับบอส!`);
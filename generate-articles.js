const fs = require('fs');
const path = require('path');

// 1. กำหนดโฟลเดอร์เป้าหมายที่จะเข้าไปสแกนหาไฟล์ .html
const articlesDir = path.join(__dirname, 'pages', 'articles');
const analysisDir = path.join(__dirname, 'pages', 'analysis');

// 2. กำหนดโฟลเดอร์ปลายทางที่จะบันทึกไฟล์สมุดเมนู (JSON)
const outputDataDir = path.join(__dirname, 'data', 'articles');

// สร้างโฟลเดอร์ปลายทางเผื่อไว้ในกรณีที่ยังไม่มี
if (!fs.existsSync(outputDataDir)) {
    fs.mkdirSync(outputDataDir, { recursive: true });
}

// 3. ฟังก์ชันสำหรับอ่านไฟล์ HTML แล้วดึงข้อมูลออกมาด้วย Regex
function extractDataFromHtml(filePath, fileName, type) {
    const htmlContent = fs.readFileSync(filePath, 'utf8');

    // ก. ดึงชื่อบทความจากแท็ก <title> (ตัดคำว่า BoxingFandom ออกให้ชื่อสั้นลง)
    const titleMatch = htmlContent.match(/<title>(.*?)<\/title>/);
    let title = titleMatch ? titleMatch[1].replace(/\s*\|.*$/, '').trim() : fileName;

    // ข. ดึงคำอธิบายสั้นๆ จาก <meta name="description">
    const descMatch = htmlContent.match(/<meta name="description" content="(.*?)">/);
    let excerpt = descMatch ? descMatch[1] : "คลิกเพื่ออ่านบทความวิเคราะห์เจาะลึกจาก BoxingFandom...";

    // ค. ดึงวันที่จาก <meta name="date"> (ถ้าไม่ได้ใส่ไว้ จะใช้วันที่แก้ไขไฟล์ล่าสุดในคอมแทน)
    const dateMatch = htmlContent.match(/<meta name="date" content="(.*?)">/);
    let date = dateMatch ? dateMatch[1] : new Date(fs.statSync(filePath).mtime).toLocaleDateString('th-TH');

    // ง. ดึงยอดวิวจาก <meta name="views"> (ถ้าไม่ได้ใส่ไว้ ระบบจะสุ่มยอดวิวให้ก่อน)
    const viewsMatch = htmlContent.match(/<meta name="views" content="(\d+)">/);
    let views = viewsMatch ? parseInt(viewsMatch[1]) : Math.floor(Math.random() * 5000) + 100;

    return {
        title: title,
        file_name: fileName,
        excerpt: excerpt,
        date: date,
        views: views,
        type: type 
    };
}

console.log("🔍 [BoxingFandom] เริ่มเดินเครื่องสแกนโฟลเดอร์บทความและวิเคราะห์มวย...");

let allArticles = [];

// 4. สแกนโฟลเดอร์ pages/articles/ (เจาะลึกจากกูรู)
if (fs.existsSync(articlesDir)) {
    const articleFiles = fs.readdirSync(articlesDir).filter(f => f.endsWith('.html') && f !== 'index.html');
    
    articleFiles.forEach(file => {
        const data = extractDataFromHtml(path.join(articlesDir, file), file, 'manual');
        allArticles.push(data);
        console.log(`📝 พบหน้าบทความ: ${file} (ยอดวิว: ${data.views})`);
    });
} else {
    console.log("⚠️ ไม่พบโฟลเดอร์ pages/articles");
}

// 5. สแกนโฟลเดอร์ pages/analysis/ (วิเคราะห์ศึก)
if (fs.existsSync(analysisDir)) {
    const analysisFiles = fs.readdirSync(analysisDir).filter(f => f.endsWith('.html') && f !== 'index.html' && !f.includes('template'));
    
    analysisFiles.forEach(file => {
        const data = extractDataFromHtml(path.join(analysisDir, file), file, 'manual'); 
        allArticles.push(data);
        console.log(`🔥 พบหน้าวิเคราะห์มวย: ${file} (ยอดวิว: ${data.views})`);
    });
} else {
    console.log("⚠️ ไม่พบโฟลเดอร์ pages/analysis");
}

// 6. บันทึกข้อมูลทั้งหมดลงไฟล์ articles-list.json
if (allArticles.length > 0) {
    const outputPath = path.join(outputDataDir, 'articles-list.json');
    try {
        fs.writeFileSync(outputPath, JSON.stringify(allArticles, null, 4), 'utf8');
        console.log(`\n✅ สร้างไฟล์สำเร็จ: ${outputPath}`);
        console.log(`🎉 จัดเก็บข้อมูลทั้งหมด ${allArticles.length} รายการ เรียบร้อยแล้ว!`);
    } catch (err) {
        console.error("❌ เกิดข้อผิดพลาดในการบันทึกไฟล์:", err);
    }
} else {
    console.log("\n⚠️ ไม่พบไฟล์ .html เลยครับ ระบบจึงไม่ได้สร้างไฟล์ JSON");
}
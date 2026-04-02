const fs = require('fs');
const path = require('path');

// ตั้งค่าพื้นฐาน
const domain = 'https://boxingfandom.com';
const dataFolder = path.join(__dirname, 'data', 'boxers');
const sitemapPath = path.join(__dirname, 'sitemap.xml');

function generateSitemap() {
    console.log('🌐 กำลังสร้าง Sitemap ใหม่...');

    // 1. เริ่มต้นไฟล์ XML
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${domain}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`;

    // 2. อ่านไฟล์ JSON ของนักมวยทุกคนเพื่อสร้าง Link
    if (fs.existsSync(dataFolder)) {
        const files = fs.readdirSync(dataFolder).filter(file => file.endsWith('.json'));
        
        files.forEach(file => {
            const fighterId = file.replace('.json', '');
            // สร้าง URL ของหน้านักมวย (อิงตามชื่อไฟล์ HTML ที่คุณสร้าง)
            const fighterUrl = `${domain}/fighter/${fighterId}.html`; 

            xml += `
  <url>
    <loc>${fighterUrl}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
        });
    }

    xml += `\n</urlset>`;

    // 3. เขียนไฟล์ลงเครื่อง
    fs.writeFileSync(sitemapPath, xml, 'utf-8');
    console.log(`✅ สร้าง Sitemap สำเร็จ! มีทั้งหมด ${fs.existsSync(dataFolder) ? fs.readdirSync(dataFolder).length + 1 : 1} URL`);
}

generateSitemap();
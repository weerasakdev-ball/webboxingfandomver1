const fs = require('fs');
const path = require('path');

// ==========================================================================
// ⚙️ ตั้งค่าโดเมนหลัก
// ==========================================================================
const domain = 'https://boxingfandom.com';
const sitemapPath = path.join(__dirname, 'sitemap.xml');
const robotsPath = path.join(__dirname, 'robots.txt');

// 🚫 แบล็คลิสต์: โฟลเดอร์และไฟล์ลับที่ไม่ต้องการให้ Google เข้ามาเห็น
const ignoreList = [
    'node_modules', 
    '.git', 
    'template',             // ไฟล์เทมเพลตต่างๆ
    'blueprint.html',       // โครงร่างเว็บ
    'admin-event.html',     // หน้าแอดมิน
    'check_json.py'
];

// ==========================================================================
// 🔍 ฟังก์ชันบอทสแกนเนอร์: ดำน้ำค้นหาไฟล์ .html ทั่วทั้งโปรเจกต์
// ==========================================================================
function getAllHtmlFiles(dirPath, arrayOfFiles) {
    let files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function(file) {
        let fullPath = path.join(dirPath, file);
        
        // ถ้าชื่อไฟล์หรือโฟลเดอร์ตรงกับ Blacklist ให้ข้ามไปเลย
        if (ignoreList.some(ignoreItem => fullPath.includes(ignoreItem))) {
            return;
        }

        // ถ้าเป็นโฟลเดอร์ ให้มุดลงไปหาต่อ (Recursive)
        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllHtmlFiles(fullPath, arrayOfFiles);
        } else {
            // ถ้าเป็นไฟล์ .html ให้เก็บเข้าคิว
            if (file.endsWith('.html')) {
                arrayOfFiles.push(fullPath);
            }
        }
    });

    return arrayOfFiles;
}

// ==========================================================================
// 🗺️ ฟังก์ชันสร้างแผนที่ (Sitemap)
// ==========================================================================
function generateSitemap() {
    console.log('🌐 กำลังส่งบอทสแกนหาไฟล์ .html ทั้งเว็บไซต์...');
    
    // สั่งบอทให้ไปกวาดรายชื่อไฟล์มาให้หมด
    let htmlFiles = getAllHtmlFiles(__dirname);
    
    // เริ่มเขียนไฟล์ XML
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

    htmlFiles.forEach(filePath => {
        // 1. ตัดพาร์ทของคอมพิวเตอร์ทิ้ง ให้เหลือแค่ชื่อโฟลเดอร์ในเว็บ (เช่น \pages\fighter\ก้องชัย.html)
        let relativePath = filePath.replace(__dirname, '');
        
        // 2. แปลงสัญลักษณ์ \ ของ Windows ให้กลายเป็น / สำหรับ URL
        relativePath = relativePath.replace(/\\/g, '/');
        if (relativePath.startsWith('/')) relativePath = relativePath.substring(1);

        // 3. ปรับแต่งความสวยงาม: ตัดคำว่า index.html ออก เพื่อให้ URL ดูคลีน (SEO ชอบ)
        let finalPath = relativePath.replace(/index\.html$/, '');

        // 4. แปลงภาษาไทยให้เป็น URL ที่กูเกิลอ่านออก (เช่น ก้องชัย กลายเป็น %E0%B8...)
        // encodeURI จะแปลงภาษาไทย แต่จะไม่ทำลายสัญลักษณ์ /
        let pageUrl = `${domain}/${encodeURI(finalPath)}`;
        
        // จัดการลบเครื่องหมาย / ที่เกินมาตัวสุดท้ายออก (ยกเว้นหน้าแรกสุด)
        if (pageUrl.endsWith('/') && pageUrl !== `${domain}/`) {
            pageUrl = pageUrl.substring(0, pageUrl.length - 1);
        }

        // 5. ให้คะแนนความสำคัญ (Priority) หน้าแรกสำคัญสุด 1.0, หน้าอื่นๆ 0.8
        let priority = '0.8';
        if (relativePath === 'index.html' || relativePath === '') priority = '1.0';

        xml += `\n  <url>\n    <loc>${pageUrl}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
    });

    xml += `\n</urlset>`;

    // เซฟไฟล์ลงเครื่อง
    fs.writeFileSync(sitemapPath, xml, 'utf-8');
    console.log(`  ✅ สร้าง sitemap.xml สำเร็จ! (กวาดหน้าเว็บมาได้ทั้งหมด ${htmlFiles.length} หน้า)`);

    // สร้างไฟล์อนุญาตบอท (Robots.txt)
    const robotsTxt = `User-agent: *\nAllow: /\nDisallow: /admin-event.html\n\nSitemap: ${domain}/sitemap.xml\n`;
    fs.writeFileSync(robotsPath, robotsTxt, 'utf-8');
    console.log(`  ✅ สร้าง robots.txt สำเร็จ!`);
}

generateSitemap();
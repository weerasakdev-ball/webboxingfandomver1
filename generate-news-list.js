const fs = require('fs');
const path = require('path');

// 1. กำหนด Path โฟลเดอร์ที่เก็บไฟล์ข่าว และที่อยู่ไฟล์ JSON สารบัญที่จะสร้าง
const newsDirPath = path.join(__dirname, 'pages', 'news');
const outputJsonPath = path.join(__dirname, 'data', 'news', 'news-list.json');

// 2. ตรวจสอบว่ามีโฟลเดอร์ data/news หรือยัง ถ้ายังไม่มีให้ระบบสร้างให้ก่อน (กัน Error)
const outputDir = path.dirname(outputJsonPath);
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

console.log('🔍 กำลังสแกนหาไฟล์ข่าวใน:', newsDirPath);

// =========================================================================
// 🚀 เตรียมโค้ดสำหรับระบบยอดวิว (View Counter Snippets) ที่จะใช้ฉีดใส่หน้าเว็บ
// =========================================================================
const cssSnippet = `
    <style>
        .view-counter-badge { display: inline-flex; align-items: center; gap: 8px; background-color: #ffffff; color: #1a1a1a; padding: 6px 14px; border-radius: 20px; font-size: 14px; font-weight: 600; border: 1px solid #ddd; margin-bottom: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
        .view-counter-badge .view-icon { font-size: 16px; color: #e50914; }
        .view-counter-badge .view-count-number { color: #e50914; font-weight: 800; font-size: 15px; }
        .view-counter-badge .view-text { color: #888; font-size: 13px; }
    </style>
</head>`;

const htmlSnippet = `</h1>
        <div class="view-counter-badge">
            <span class="view-icon">👁️</span>
            <span class="view-count-number" id="pageViewsCount">กำลังโหลด...</span>
            <span class="view-text">ครั้ง</span>
        </div>`;

const jsSnippet = `
    <script>
        window.addEventListener('DOMContentLoaded', async () => {
            const d = document.getElementById('pageViewsCount');
            if (!d) return;
            try {
                let p = window.location.pathname.split('/').pop().replace('.html', '');
                if (!p || p === 'index') p = 'home_' + Math.random().toString(36).substr(2, 5);
                const res = await fetch('https://api.counterapi.dev/v1/boxingfandom_views/' + encodeURIComponent(p.toLowerCase()) + '/up');
                if (!res.ok) throw new Error("API Error");
                const data = await res.json();
                d.innerText = Number(data.count).toLocaleString('en-US');
            } catch (e) { d.innerText = "-"; }
        });
    </script>
</body>`;


try {
    // 3. อ่านรายชื่อไฟล์ทั้งหมดในโฟลเดอร์ pages/news
    const files = fs.readdirSync(newsDirPath);
    const newsList = []; // (ป้องกันข่าวซ้ำ) เคลียร์รายชื่อข่าวให้ว่างเปล่าทุกครั้งที่รันสคริปต์ 

    for (const file of files) {
        // --- ระบบกรองไฟล์ ---
        if (path.extname(file).toLowerCase() !== '.html') continue; 
        if (file.toLowerCase() === 'index.html' || file.toLowerCase() === 'template.html') continue;

        // --- อ่านข้อมูลจากไฟล์ข่าวตัวจริง ---
        const filePath = path.join(newsDirPath, file);
        let fileContent = fs.readFileSync(filePath, 'utf-8');
        let isModified = false;

        // =========================================================================
        // 💉 ภารกิจฉีดระบบยอดวิวอัตโนมัติ (เช็กก่อนว่ามีโค้ดนี้หรือยัง เพื่อไม่ให้เบิ้ลซ้ำ)
        // =========================================================================
        if (!fileContent.includes('id="pageViewsCount"')) {
            // 1. ฝัง CSS ก่อนปิดแท็ก </head>
            if (fileContent.includes('</head>')) {
                fileContent = fileContent.replace('</head>', cssSnippet);
            }
            
            // 2. ฝัง HTML ใต้แท็ก </h1> ตัวแรกที่เจอ
            if (fileContent.includes('</h1>')) {
                fileContent = fileContent.replace('</h1>', htmlSnippet);
            }
            
            // 3. ฝัง สคริปต์ ก่อนปิดแท็ก </body>
            if (fileContent.includes('</body>')) {
                fileContent = fileContent.replace('</body>', jsSnippet);
            }

            isModified = true;
        }

        // ถ้ามีการฉีดโค้ดยอดวิวเพิ่มเข้าไป ให้เซฟไฟล์ HTML ทับของเดิมทันที
        if (isModified) {
            fs.writeFileSync(filePath, fileContent, 'utf-8');
            console.log(`✨ ติดตั้งระบบยอดวิวอัตโนมัติลงในไฟล์: ${file}`);
        }

        // =========================================================================
        // 📦 กระบวนการดึงข้อมูลสร้าง JSON สารบัญ (ทำงานต่อจากเดิม)
        // =========================================================================

        // ก. ดึงหัวข้อข่าวจากแท็ก <title> หรือ <h1>
        let title = "ไม่มีหัวข้อข่าว";
        const titleMatch = fileContent.match(/<title>(.*?)<\/title>/i) || fileContent.match(/<h1[^>]*>(.*?)<\/h1>/i);
        if (titleMatch && titleMatch[1]) {
            title = titleMatch[1].replace(/\s*\|\s*BoxingFandom/ig, '').trim();
        }

        // ข. ดึงรูปภาพจากแท็ก <img ... src="..."> อันแรกที่เจอในข่าว
        let image = "https://via.placeholder.com/400x200?text=No+Image";
        const imgMatch = fileContent.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch && imgMatch[1]) {
            image = imgMatch[1];
        }

        // ค. ดึงวันที่ 
        let date = new Date().toISOString().split('T')[0]; 
        const dateMatch = fileContent.match(/<div[^>]*class=["'][^"']*news-date[^"']*["'][^>]*>(.*?)<\/div>/i);
        if (dateMatch && dateMatch[1]) {
            date = dateMatch[1].replace(/📅/g, '').trim(); // ลบอีโมจิออกถ้ามี
        } else {
            const stats = fs.statSync(filePath);
            date = stats.mtime.toISOString().split('T')[0];
        }

        // ง. ดึงคำโปรย (Excerpt) จาก <meta name="description"> 
        let excerpt = "คลิกเพื่ออ่านรายละเอียดข่าวฉบับเต็ม...";
        const descMatch = fileContent.match(/<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']/i) || 
                          fileContent.match(/<p[^>]*class=["'][^"']*news-excerpt[^"']*["'][^>]*>(.*?)<\/p>/i);
        if (descMatch && descMatch[1]) {
            excerpt = descMatch[1].trim();
        }

        // นำข้อมูลประกอบร่างเตรียมเขียนลง JSON
        newsList.push({
            id: file.replace('.html', ''),
            title: title,
            date: date,
            excerpt: excerpt,
            image: image,
            link: file 
        });

        console.log(`✅ สแกนเจอข่าว: ${file} -> "${title}"`);
    }

    // 4. เรียงลำดับข่าวจากใหม่สุด (วันล่าสุด) ไปเก่าสุด
    newsList.sort((a, b) => new Date(b.date) - new Date(a.date));

    // 5. เขียนลงไฟล์ JSON (เขียนทับไฟล์เก่าเสมอ ป้องกันข่าวซ้ำ)
    fs.writeFileSync(outputJsonPath, JSON.stringify(newsList, null, 4), 'utf-8');
    
    console.log(`\n🎉 อัปเดตไฟล์ news-list.json สำเร็จเรียบร้อย!`);
    console.log(`📊 ดึงข้อมูลข่าวมาได้ทั้งหมด: ${newsList.length} ข่าว`);
    console.log(`📁 ไฟล์สารบัญถูกบันทึกไว้ที่: ${outputJsonPath}`);

} catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการรันสคริปต์:', error.message);
}
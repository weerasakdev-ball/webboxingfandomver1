// ดึงเครื่องมือสำหรับจัดการไฟล์ระบบของ Node.js มาใช้งาน
const fs = require('fs');
const path = require('path');

// กำหนดเส้นทางไปยังโฟลเดอร์ที่เก็บข้อมูลนักมวยของเรา
const boxersDir = path.join(__dirname, 'data', 'boxers');

// กำหนดชื่อไฟล์ผลลัพธ์ที่เราต้องการสร้าง
const outputFile = path.join(boxersDir, 'fighters-list.json');

console.log('⏳ กำลังสแกนหาไฟล์นักมวย...');

// อ่านรายชื่อไฟล์ทั้งหมดที่อยู่ในโฟลเดอร์ data/boxers/
fs.readdir(boxersDir, (err, files) => {
    if (err) {
        return console.error('❌ เกิดข้อผิดพลาดในการอ่านโฟลเดอร์:', err);
    }

    // กรองเอาเฉพาะไฟล์ที่ลงท้ายด้วย .json และไม่เอาไฟล์ fighters-list.json ตัวเก่า
    const jsonFiles = files.filter(file => file.endsWith('.json') && file !== 'fighters-list.json');

    // นำรายชื่อไฟล์ที่กรองแล้ว มาเขียนลงในไฟล์ fighters-list.json เป็นรูปแบบ Array
    fs.writeFile(outputFile, JSON.stringify(jsonFiles, null, 2), (err) => {
        if (err) {
            return console.error('❌ เกิดข้อผิดพลาดในการเขียนไฟล์:', err);
        }
        console.log('✅ สร้างไฟล์ fighters-list.json สำเร็จแล้ว!');
        console.log(`พบข้อมูลนักมวยทั้งหมด: ${jsonFiles.length} คน`);
    });
});
import os
import re

# กำหนดโฟลเดอร์เป้าหมายให้ถูกต้องตามโครงสร้างโปรเจกต์
folder_path = './data/boxers'

print("🥊 บอล บ็อกซิ่งแฟนด้อม AI: สวมนวมพร้อมแล้ว! กำลังสแกนหาไฟล์และจัดการตัวซ้ำ...\n")

rename_count = 0
delete_count = 0
skip_count = 0

# ตรวจสอบว่ามีโฟลเดอร์อยู่จริงหรือไม่
if not os.path.exists(folder_path):
    print(f"❌ ไม่พบโฟลเดอร์ {folder_path} โปรดตรวจสอบ path อีกครั้ง")

else:
    
    # วนลูปอ่านไฟล์ทั้งหมดในโฟลเดอร์เป้าหมาย
    for filename in os.listdir(folder_path):
        
        # เลือกลงดาบเฉพาะไฟล์ .json หรือ .html เท่านั้น เพื่อความปลอดภัยของระบบ
        if filename.endswith('.json') or filename.endswith('.html'):
            
            # ใช้ Regex เปลี่ยนช่องว่าง (1 หรือหลายเคาะ) เป็นขีดกลาง '-'
            # .strip() ช่วยตัดช่องว่างที่อาจเผลอเคาะทิ้งไว้หน้าและหลังสุดออกก่อน
            new_filename = re.sub(r'\s+', '-', filename.strip())
            
            # ถ้าชื่อใหม่ไม่เหมือนชื่อเดิม (แปลว่าไฟล์นี้มีช่องว่างแทรกอยู่)
            if filename != new_filename:
                
                old_file = os.path.join(folder_path, filename)
                new_file = os.path.join(folder_path, new_filename)
                
                # ตรวจสอบว่ามีไฟล์ชื่อใหม่ (แบบมีขีดกลาง) อยู่ในระบบแล้วหรือไม่
                if os.path.exists(new_file):
                    
                    # หากมีไฟล์แบบมีขีดกลางอยู่แล้ว แสดงว่าไฟล์เว้นวรรคนี้คือ "ไฟล์ซ้ำ" ให้สั่งลบทิ้ง
                    try:
                        os.remove(old_file)
                        print(f"🗑️ ลบไฟล์ซ้ำสำเร็จ: '{filename}'  (เพราะมี '{new_filename}' อยู่แล้ว)")
                        delete_count += 1
                        
                    except Exception as e:
                        print(f"❌ ลบไฟล์ '{filename}' ไม่สำเร็จ: {e}")
                        
                else:
                    
                    # หากยังไม่มีไฟล์แบบมีขีดกลาง ให้ทำการเปลี่ยนชื่อไฟล์เก่าให้ถูกต้อง
                    try:
                        os.rename(old_file, new_file)
                        print(f"✅ อัปเดตชื่อสำเร็จ: '{filename}'  👉  '{new_filename}'")
                        rename_count += 1
                        
                    except Exception as e:
                        print(f"❌ เปลี่ยนชื่อไฟล์ '{filename}' ไม่สำเร็จ: {e}")
                        
            else:
                
                # กรณีชื่อไฟล์ไม่มีช่องว่างอยู่แล้ว ระบบจะนับว่าผ่านเกณฑ์และข้ามไป
                skip_count += 1


    # สรุปผลการทำงานหลังชกจบ
    print("\n=======================================")
    print("🏆 สรุปผลการจัดการไฟล์ (Clean Up Report):")
    print(f"- 🗑️ ไฟล์แฝดที่ถูกลบทิ้ง (ลบตัวซ้ำที่มีช่องว่าง): {delete_count} ไฟล์")
    print(f"- 🔄 ไฟล์ที่ถูกอัปเดตชื่อ (เปลี่ยนช่องว่างเป็นขีดกลาง): {rename_count} ไฟล์")
    print(f"- ⏭️ ไฟล์ที่ข้าม (ชื่อสมบูรณ์แบบอยู่แล้ว): {skip_count} ไฟล์")
    print("=======================================\n")
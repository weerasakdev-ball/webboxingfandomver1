import os
import json
import re

folder_path = './data/boxers'

print("🛠️ บอล บ็อกซิ่งแฟนด้อม AI: เริ่มปฏิบัติการซ่อมไฟล์ JSON ขั้นเทพ (สลับแผน A / B)...\n")

fixed_count = 0
still_broken = []
valid_count = 0

# ฟังก์ชันสุดยอดการซ่อมไฟล์ที่ติด Git Conflict
def try_fix_git_conflict(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        if '<<<<<<< HEAD' not in content:
            return False

        # Pattern จับบล็อก Git Conflict ทั้งก้อน
        # \1 คือ โค้ดส่วนบน (HEAD) | \2 คือ โค้ดส่วนล่าง (อัปเดตใหม่)
        pattern = re.compile(r'<<<<<<< HEAD\n?(.*?)\n?=======\n?(.*?)\n?>>>>>>> [a-fA-F0-9]+\n?', re.DOTALL)

        # แผน A: ลองเก็บโค้ดท่อนบน (HEAD) ทิ้งท่อนล่าง
        variant_a = pattern.sub(r'\1\n', content)
        try:
            json.loads(variant_a)
            # ถ้าโหลดผ่าน เซฟทับเลย
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(variant_a)
            return True
        except json.JSONDecodeError:
            pass

        # แผน B: ลองเก็บโค้ดท่อนล่าง (Incoming) ทิ้งท่อนบน
        variant_b = pattern.sub(r'\2\n', content)
        try:
            json.loads(variant_b)
            # ถ้าแผน A ไม่รอด แต่แผน B รอด ก็เซฟทับเลย
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(variant_b)
            return True
        except json.JSONDecodeError:
            pass
            
    except Exception:
        pass
        
    return False

# เริ่มการทำงานหลัก
if not os.path.exists(folder_path):
    print(f"❌ ไม่พบโฟลเดอร์ {folder_path}")
else:
    for filename in os.listdir(folder_path):
        if filename.endswith('.json'):
            filepath = os.path.join(folder_path, filename)
            
            try:
                # ลองเปิดอ่านไฟล์ตามปกติก่อน
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                # ไฟล์ fighters-list ข้ามการเช็ก fighter_profile ไปเลย
                if filename == 'fighters-list.json':
                    valid_count += 1
                elif "fighter_profile" in data:
                    valid_count += 1
                else:
                    still_broken.append(f"{filename} (โครงสร้างผิด: ไม่มี fighter_profile)")
                    
            except json.JSONDecodeError:
                # ถ้าอ่านไม่ได้ แสดงว่าพัง ลองส่งเข้าศูนย์ซ่อม
                print(f"🔧 กำลังพยายามประกอบร่างไฟล์: {filename}...")
                if try_fix_git_conflict(filepath):
                    print(f"   ✅ ซ่อมสำเร็จ!")
                    fixed_count += 1
                    valid_count += 1
                else:
                    print(f"   ❌ ซ่อมไม่สำเร็จ ต้องแก้ด้วยมือ (วงเล็บปีกกาอาจจะหายไป)")
                    still_broken.append(f"{filename} (ซ่อมไม่ได้ โครงสร้างวงเล็บพังหนัก)")
            except Exception as e:
                still_broken.append(f"{filename} (Error: {e})")

    # สรุปผลหลังการซ่อม
    print("\n=======================================")
    print(f"🩺 สรุปผลการซ่อมแซมไฟล์ JSON:")
    print(f"✅ ไฟล์ที่สมบูรณ์อ่านได้ชัวร์ๆ: {valid_count} ไฟล์")
    print(f"🛠️ ไฟล์ที่ AI ซ่อมสำเร็จอัตโนมัติ: {fixed_count} ไฟล์")
    print(f"❌ ไฟล์ที่พังหนัก (ต้องเปิดแก้ด้วยมือ): {len(still_broken)} ไฟล์")
    print("=======================================")
    
    if still_broken:
        print("\n🚨 รายชื่อไฟล์ที่ซ่อมไม่สำเร็จ (เข้าไปเติมวงเล็บ } ปิดท้ายไฟล์ดูครับ):")
        for f in still_broken:
            print(f"  - {f}")
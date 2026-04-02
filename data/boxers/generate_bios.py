import os
import json
import glob

def generate_bio(data):
    # ดึงข้อมูลส่วนต่างๆ ออกมาเพื่อเตรียมเขียนประวัติ
    profile = data.get("fighter_profile", {})
    history = data.get("fight_history", [])

    name_th = profile.get("name_th", "ไม่ระบุชื่อ")
    name_en = profile.get("name_en", "ไม่ระบุชื่อภาษาอังกฤษ")
    age = profile.get("personal_info", {}).get("age", "ไม่ระบุ")
    country = profile.get("personal_info", {}).get("country_th", "ไม่ระบุประเทศ")
    team = profile.get("personal_info", {}).get("team_th", "ไม่ระบุสังกัด")
    style = profile.get("fighting_style_th", "มวยไทย")
    weight_class = profile.get("physical_stats", {}).get("division", "ไม่ระบุรุ่นน้ำหนัก")
    weight_kg = profile.get("physical_stats", {}).get("weight_kg", "ไม่ระบุ")
    height_cm = profile.get("physical_stats", {}).get("height_cm", "ไม่ระบุ")

    # เริ่มสร้างประโยค
    bio = f"{name_th} ({name_en}) เป็นนักชกชาว{country} "
    
    if age != "ไม่ระบุ":
        bio += f"วัย {age} ปี "
        
    if team != "ไม่ระบุ" and team != "ไม่ระบุสังกัด":
        bio += f"จากสังกัด{team} "
    
    bio += f"มีความถนัดในการต่อสู้สไตล์{style} "
    bio += f"ปัจจุบันชกอยู่ในพิกัดน้ำหนัก {weight_class} "
    
    if weight_kg != "ไม่ระบุ":
        bio += f"(ประมาณ {weight_kg} กิโลกรัม) "
        
    if height_cm != "ไม่ระบุ":
        bio += f"ส่วนสูง {height_cm} เซนติเมตร "

    # ดึงข้อมูลการชกล่าสุด (ถ้ามี)
    if history and len(history) > 0:
        last_fight = history[0]
        opponent = last_fight.get("opponent_th", "คู่ต่อสู้")
        result = last_fight.get("result", "")
        method = last_fight.get("method_en", "")
        event = last_fight.get("event_en", "การแข่งขันล่าสุด")
        
        # แปลงผลการแข่งขันเป็นภาษาไทย
        if result.lower() == "win":
            result_th = "เอาชนะ"
        elif result.lower() == "loss":
            result_th = "พ่ายแพ้ให้กับ"
        elif result.lower() == "draw":
            result_th = "เสมอผลคะแนนกับ"
        else:
            result_th = "ประชันฝีมือกับ"
        
        bio += f"ผลงานการชกล่าสุดในรายการ {event} สามารถ{result_th} {opponent} ด้วยรูปแบบ {method} ถือเป็นนักชกที่น่าติดตามผลงานอย่างยิ่ง"
    else:
        bio += "กำลังมุ่งมั่นฝึกซ้อมและรอพิสูจน์ฝีมือในไฟต์ต่อไปบนสังเวียน"

    return bio



def process_json_files(folder_path):
    # ค้นหาไฟล์ .json ทั้งหมดในโฟลเดอร์ที่กำหนด
    search_pattern = os.path.join(folder_path, '*.json')
    json_files = glob.glob(search_pattern)
    
    if not json_files:
        print(f"ไม่พบไฟล์ JSON ในโฟลเดอร์: {folder_path}")
        return

    print(f"พบไฟล์ JSON ทั้งหมด {len(json_files)} ไฟล์ กำลังเริ่มดำเนินการเพิ่มประวัติย่อ...")

    for file_path in json_files:
        try:
            # เปิดอ่านไฟล์ JSON
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # สร้างประวัติย่อจากฟังก์ชัน
            bio_text = generate_bio(data)
            
            # เพิ่มคีย์ short_biography เข้าไปในโครงสร้าง fighter_profile
            if "fighter_profile" in data:
                data["fighter_profile"]["short_biography"] = bio_text
            
            # บันทึกข้อมูลกลับไปทับไฟล์ JSON เดิม
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=4)
                
            print(f"สำเร็จ: อัปเดตประวัติย่อลงในไฟล์ '{os.path.basename(file_path)}' เรียบร้อยแล้ว")
            
        except Exception as e:
            print(f"เกิดข้อผิดพลาดกับไฟล์ '{file_path}': {str(e)}")



if __name__ == "__main__":
    
    # ==========================================================================
    # ⚙️ กำหนดชื่อโฟลเดอร์เป้าหมายให้ชี้ไปที่โครงสร้างปัจจุบัน
    # ==========================================================================
    target_folder = "./data/boxers"
    
    # ตรวจสอบว่ามีโฟลเดอร์นี้อยู่หรือไม่ ถ้าไม่มีให้สร้างขึ้นมาใหม่
    if not os.path.exists(target_folder):
        os.makedirs(target_folder)
        print(f"ระบบได้สร้างโฟลเดอร์ '{target_folder}' ให้แล้ว!")
        print(f"กรุณานำไฟล์ JSON ของนักมวยทั้งหมดไปใส่ไว้ในโฟลเดอร์ '{target_folder}' แล้วรันโปรแกรมนี้อีกครั้งครับ")
    else:
        # เรียกใช้ฟังก์ชันหลัก
        process_json_files(target_folder)
        print("--- เสร็จสิ้นการอัปเดตข้อมูลทั้งหมด ---")
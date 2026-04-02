const fs = require('fs');
const path = require('path');

// [คงเดิม] การตั้งค่า Path และโฟลเดอร์
const boxersDir = path.join(__dirname, 'data', 'boxers');
const outputDirs = {
    one_championship: path.join(__dirname, 'data', 'rankings', 'one_championship'),
    overall: path.join(__dirname, 'data', 'rankings', 'overall')
};

function generateRankingsWithTrend() {
    console.log("🚀 กำลังคำนวณอันดับพร้อมระบบตรวจสอบสถานะ ขึ้น/ลง...");

    // สร้างโฟลเดอร์ถ้ายังไม่มี
    for (const key in outputDirs) {
        if (!fs.existsSync(outputDirs[key])) fs.mkdirSync(outputDirs[key], { recursive: true });
    }

    const rankingsData = { one_championship: {}, overall: {} };
    const files = fs.readdirSync(boxersDir);

    // ========================================================================
    // [ขั้นตอนพิเศษ] ดึงอันดับเก่ามาเก็บไว้เปรียบเทียบ (Previous Rank)
    // ========================================================================
    const previousRanks = {}; 
    // โครงสร้าง: previousRanks['one_championship']['flyweight']['โจเซฟ'] = 1

    for (const cat in outputDirs) {
        previousRanks[cat] = {};
        const catPath = outputDirs[cat];
        if (fs.existsSync(catPath)) {
            const rankFiles = fs.readdirSync(catPath);
            rankFiles.forEach(rf => {
                try {
                    const oldData = JSON.parse(fs.readFileSync(path.join(catPath, rf), 'utf-8'));
                    const divName = oldData.division;
                    previousRanks[cat][divName] = {};
                    // บันทึกอันดับเดิมของทุกคนในรุ่นนี้
                    oldData.fighters.forEach((f, index) => {
                        previousRanks[cat][divName][f.name_th] = index + 1;
                    });
                } catch (e) {}
            });
        }
    }

    // ========================================================================
    // [คงเดิม] การประมวลผลข้อมูลนักมวย (Map & Calculation)
    // ========================================================================
    files.forEach(file => {
        if (file === 'fighters-list.json' || !file.endsWith('.json')) return;
        try {
            const fighterData = JSON.parse(fs.readFileSync(path.join(boxersDir, file), 'utf-8'));
            const profile = fighterData.fighter_profile;
            if (!profile || !profile.physical_stats?.division) return;

            const division = profile.physical_stats.division;
            let isOneFighter = false;

            // [Logic การคำนวณคะแนนเดิมที่สมบูรณ์แล้วของคุณ]
            const statsTemplate = () => ({ wins: 0, losses: 0, draws: 0, ko_wins: 0, points: 0 });
            const detailedStats = {
                lifetime: { one: statsTemplate(), others: statsTemplate(), total: statsTemplate() },
                yearly: {} 
            };

            if (fighterData.fight_history && Array.isArray(fighterData.fight_history)) {
                fighterData.fight_history.forEach(fight => {
                    const year = new Date(fight.date).getFullYear();
                    if (isNaN(year)) return;
                    if (!detailedStats.yearly[year]) {
                        detailedStats.yearly[year] = { one: statsTemplate(), others: statsTemplate(), total: statsTemplate() };
                    }
                    const eventName = (fight.event_en || "").toUpperCase();
                    const isOneEvent = eventName.includes("ONE") || eventName.includes("LUMPINEE");
                    if (isOneEvent) isOneFighter = true;

                    let pts = 0;
                    const method = (fight.method_en || "").toUpperCase();
                    const isKO = method.includes("KO") || method.includes("TKO");
                    if (fight.result === 'Win') pts = isKO ? 5 : 3;
                    else if (fight.result === 'Draw') pts = 1;

                    const updateBox = (box) => {
                        if (fight.result === 'Win') { box.wins++; if (isKO) box.ko_wins++; }
                        else if (fight.result === 'Loss') box.losses++;
                        else if (fight.result === 'Draw') box.draws++;
                        box.points += pts;
                    };

                    updateBox(detailedStats.lifetime.total);
                    if (isOneEvent) updateBox(detailedStats.lifetime.one);
                    else updateBox(detailedStats.lifetime.others);
                });
            }

            const entry = {
                name_th: profile.name_th,
                image_url: profile.image_url,
                team_th: profile.personal_info?.team_th || 'ไม่ระบุ',
                country_th: profile.personal_info?.country_th || 'ไม่ระบุ',
                stats: detailedStats, 
                profile_file: file.replace('.json', '.html')
            };

            if (!rankingsData.overall[division]) rankingsData.overall[division] = [];
            rankingsData.overall[division].push(entry);

            if (isOneFighter) {
                if (!rankingsData.one_championship[division]) rankingsData.one_championship[division] = [];
                rankingsData.one_championship[division].push(entry);
            }
        } catch (e) { console.error(`❌ Error ${file}:`, e.message); }
    });

    // ========================================================================
    // [ขั้นตอนสำคัญ] จัดอันดับและบันทึกผลต่าง (Trend Calculation)
    // ========================================================================
    const today = new Date().toISOString().split('T')[0];

    for (const cat in rankingsData) {
        for (const div in rankingsData[cat]) {
            
            // 1. เรียงอันดับใหม่ก่อน (Sort by points)
            rankingsData[cat][div].sort((a, b) => {
                const ptsA = (cat === 'one_championship') ? a.stats.lifetime.one.points : a.stats.lifetime.total.points;
                const ptsB = (cat === 'one_championship') ? b.stats.lifetime.one.points : b.stats.lifetime.total.points;
                return ptsB - ptsA;
            });

            // 2. เปรียบเทียบกับอันดับเดิม
            const finalFighters = rankingsData[cat][div].map((f, index) => {
                const currentRank = index + 1;
                const oldRank = previousRanks[cat][div] ? previousRanks[cat][div][f.name_th] : null;
                
                let trend = 'new'; // ค่าเริ่มต้นเป็นนักมวยเข้าใหม่ (New Entry)
                if (oldRank) {
                    if (currentRank < oldRank) trend = 'up';      // อันดับดีขึ้น (เลขน้อยลง)
                    else if (currentRank > oldRank) trend = 'down'; // อันดับแย่ลง (เลขมากขึ้น)
                    else trend = 'steady';                         // อันดับเท่าเดิม
                }

                return { ...f, trend: trend, last_rank: oldRank };
            });

            // 3. บันทึกไฟล์
            const safeName = div.toLowerCase().replace(/[\/\\]/g, '-').replace(/\s+/g, '');
            const outputPath = path.join(outputDirs[cat], `${safeName}.json`);
            fs.writeFileSync(outputPath, JSON.stringify({
                last_updated: today,
                division: div,
                fighters: finalFighters
            }, null, 4));
            
            console.log(`✔️ [Trend] บันทึกไฟล์: [${cat}] ${safeName}.json`);
        }
    }
    console.log("🎉 ระบบคำนวณอันดับพร้อม Trend เสร็จสมบูรณ์!");
}

generateRankingsWithTrend();
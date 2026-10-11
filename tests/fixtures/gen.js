// 検査用の大きな旅程を作る（実在の予定ではない）
const STATIONS = ['徳島', '佐古', '蔵本', '鴨島', '阿波池田', '高松', '坂出', '岡山', '新大阪', '名古屋', '品川', '横浜', '桜木町', '新橋', '浜松町', '羽田空港'];
const TYPES = ['train', 'meal', 'event', 'walk', 'shopping', 'bus', 'free_time', 'standby'];

function pad(n) { return String(n).padStart(2, '0'); }
function hhmm(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }

function bigTrip(days = 4, perDay = 18, start = '2026-11-20') {
  const d0 = new Date(start + 'T00:00:00');
  const out = { title: `検査用 ${days}日×${perDay}件`, startDate: start, endDate: '', totalBudget: 120000, members: 1, days: [] };
  let n = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(d0); d.setDate(d.getDate() + i);
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const events = [];
    let t = 7 * 60;
    for (let j = 0; j < perDay; j++, n++) {
      const type = TYPES[(i + j) % TYPES.length];
      const a = STATIONS[(i + j) % STATIONS.length], b = STATIONS[(i + j + 3) % STATIONS.length];
      const e = { id: `g${i}_${j}`, type, title: type === 'train' ? `${a} → ${b}` : `予定 ${i + 1}-${j + 1}（${['昼食', 'ライブ', '物販', '散策', '移動', '休憩'][j % 6]}）`,
        startTime: hhmm(t), endTime: hhmm(t + 35), location: type === 'train' ? '' : `${a}駅の近く`, cost: (j % 4) * 800, notes: j % 3 === 0 ? 'メモ：' + '長めの説明文。'.repeat(1 + (j % 4)) : '' };
      if (type === 'train') {
        e.route = [
          { name: a, depPlatform: '2番線', depTime: hhmm(t), line: 'JR高徳線', dest: b, stations: '5駅', kind: j % 2 ? '特急うずしお' : '' },
          { name: STATIONS[(i + j + 1) % STATIONS.length], arrTime: hhmm(t + 15), arrPlatform: '1番線', depPlatform: '3番線', depTime: hhmm(t + 20), line: 'JR徳島線', dest: b, stations: '3駅' },
          { name: b, arrTime: hhmm(t + 35), arrPlatform: '4番線' },
        ];
      }
      events.push(e);
      t += 50;
    }
    out.days.push({ date, dayNumber: i + 1, events });
    out.endDate = date;
  }
  return out;
}

module.exports = { bigTrip };

// 路線名の照らし合わせ（通信なし。駅データは注入する）
// ・「東急新横浜線」を「JR横浜線」と取り違えない（会社が違う・いちばん長く一致するものを選ぶ）
// ・HeartRails の「相模鉄道・東京急行電鉄」＝東急新横浜線／相鉄新横浜線
// ・目黒線のデータが武蔵小杉で止まっていても、日吉でつながる直通として扱う
// ・会場と最寄り駅のつなぎ目で、電車の乗る駅を会場名に書き換える案を出さない
const { launch, open, app, suite, tripStorage, sleep } = require('./lib');

const SHIN = ['JR横浜線', '東海道新幹線', '横浜市ブルーライン', '相模鉄道・東京急行電鉄'];
const st = (name, rows) => ({ found: true, name, lines: [...new Set(rows.map(r => r[0]))], rows: rows.map(r => ({ line: r[0], prefecture: '', x: r[2], y: r[1] })), pos: { x: rows[0][2], y: rows[0][1] }, prefectures: [] });

(async () => {
  const t = suite('路線名');
  const browser = await launch();
  try {
    const page = await open(browser);
    const cases = [
      ['東急新横浜線', SHIN, '相模鉄道・東京急行電鉄'],
      ['相鉄新横浜線', SHIN, '相模鉄道・東京急行電鉄'],
      ['新横浜線', SHIN, '相模鉄道・東京急行電鉄'],
      ['横浜線', SHIN, 'JR横浜線'],
      ['JR横浜線', SHIN, 'JR横浜線'],
      ['ブルーライン', SHIN, '横浜市ブルーライン'],
      ['横浜市営地下鉄', SHIN, '横浜市ブルーライン'],
      ['京急本線', ['JR京浜東北線', '京浜急行本線'], '京浜急行本線'],
      ['京浜東北線', ['京浜急行本線', 'JR京浜東北線'], 'JR京浜東北線'],
      ['りんかい線', ['JR京浜東北線', '東京りんかい線', '東急大井町線'], '東京りんかい線'],
      ['目黒線', ['東急大井町線', '東急目黒線'], '東急目黒線'],
      ['東急東横線', ['JR横浜線', '東急東横線'], '東急東横線'],
    ];
    for (const [input, cands, want] of cases) {
      const got = await app(page, (A, i, c) => A.matchLine(i, c), input, cands);
      t.ok(got === want, `「${input}」→「${want}」`, got);
    }

    // HeartRails の目黒線は武蔵小杉で止まっている → 日吉まで補う
    const OLD_MEGURO = ['目黒', '不動前', '武蔵小山', '西小山', '洗足', '大岡山', '奥沢', '田園調布', '多摩川', '新丸子', '武蔵小杉'];
    const meguro = await app(page, (A, l) => A.patchLine('東急目黒線', l), OLD_MEGURO);
    t.eq(meguro.slice(-3), ['武蔵小杉', '元住吉', '日吉'], '目黒線の並びを日吉まで補う');
    t.eq(await app(page, (A, l) => A.patchLine('東急目黒線', l), meguro), meguro, '補ったあとは二重に足さない');

    // 新横浜 → 大岡山（東急新横浜線、日吉から目黒線へ直通）：「駅がありません」と言わない
    const trip = { title: '新横浜線', startDate: '2026-11-21', endDate: '2026-11-21', days: [{ date: '2026-11-21', events: [
      { id: 'arena', type: 'activity', title: '横浜アリーナ', location: '横浜アリーナ', startTime: '09:00', endTime: '10:20' },
      { id: 'tr', type: 'train', title: '新横浜 → 大岡山', startTime: '10:35', endTime: '10:56', route: [
        { name: '新横浜', depTime: '10:35', line: '東急新横浜線', dest: '浦和美園' },
        { name: '大岡山', arrTime: '10:56' } ] } ] }] };
    const p2 = await open(browser, { storage: tripStorage(trip) });
    const issues = await app(p2, (A, data) => {
      const k = A.placeKey;
      A.railIdx.station[k('新横浜')] = data.shin;
      A.railIdx.station[k('大岡山')] = data.ooka;
      A.railIdx.line['相模鉄道・東京急行電鉄'] = ['西谷', '羽沢横浜国大', '新横浜', '新綱島', '日吉'];
      A.railIdx.line['東急目黒線'] = data.meguro;
      A.railIdx.line['東急大井町線'] = ['大井町', '下神明', '戸越公園', '中延', '荏原町', '旗の台', '北千束', '大岡山', '緑が丘', '自由が丘'];
      A.railIdx.place[k('横浜アリーナ')] = { x: 139.6205, y: 35.5122 };
      return A.dayIssues(A.state.days[0], 0).map(x => ({ level: x.level, type: x.type, msg: x.msg, fix: !!x.fix }));
    }, {
      shin: st('新横浜', SHIN.map(l => [l, 35.5068, 139.6176])),
      ooka: st('大岡山', [['東急大井町線', 35.6075, 139.6858], ['東急目黒線', 35.6075, 139.6858]]),
      meguro,
    });
    t.ok(!issues.some(x => /JR横浜線/.test(x.msg)), 'JR横浜線と取り違えない', issues);
    t.ok(issues.some(x => x.level === 'info' && /東急新横浜線 と 東急目黒線 は 日吉 でつながっています/.test(x.msg)), '日吉でつながる直通として「気づき」に下げる（文には本人が書いた路線名）', issues);
    t.ok(!issues.some(x => x.level === 'error'), '要修正は出ない', issues);
    const chain = issues.find(x => x.type === 'chain');
    t.ok(!!chain && (chain.level === 'info' && !chain.fix && /歩いて約\d+分/.test(chain.msg)), '会場と最寄り駅のあいだは「歩いて約N分」の気づき（電車の乗る駅を会場名に書き換える案は出さない）', chain);
    t.ok(!page.errors.length && !p2.errors.length, 'エラーなし', [page.errors, p2.errors]);
  } catch (e) { t.ok(false, '例外なく最後まで走る', e.stack); }
  await browser.close();
  t.done();
})();

#!/usr/bin/env node
/**
 * semr サンプルデータ生成スクリプト
 * 100人の患者 × 各100カルテ × 各100処方 × 各100検査結果
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function uuid() { return crypto.randomUUID(); }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function pickN(a, n) { return [...a].sort(() => Math.random() - 0.5).slice(0, n); }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randFloat(min, max, d = 1) { return Number((Math.random() * (max - min) + min).toFixed(d)); }
function randDate(sy, ey) {
    const s = new Date(sy, 0, 1), e = new Date(ey, 11, 31);
    const d = new Date(s.getTime() + Math.random() * (e.getTime() - s.getTime()));
    return d.toISOString().split('T')[0];
}
function padCode(n) { return 'P' + String(n).padStart(4, '0'); }

// ============================================================
// マスタデータ
// ============================================================
const LAST_NAMES = [
    '田中','山田','佐藤','鈴木','高橋','伊藤','渡辺','中村','小林','加藤',
    '吉田','山本','松本','井上','木村','林','清水','山口','阿部','池田',
    '橋本','森','石川','前田','小川','藤田','岡田','後藤','長谷川','村上',
    '近藤','石井','斎藤','坂本','遠藤','青木','藤井','西村','福田','太田',
    '三浦','岡本','松田','中島','中野','原田','小野','田村','竹内','金子',
    '和田','中山','石田','上田','森田','原','柴田','酒井','工藤','横山',
    '宮崎','宮本','内田','高木','安藤','島田','谷口','大野','高田','丸山',
    '今井','河野','藤原','小島','久保','松井','千葉','岩崎','桜井','木下',
    '野口','松尾','菊地','野村','新井','渡部','佐々木','杉山','古川','平野',
    '山下','本田','杉本','浜田','飯田','市川','大塚','武田','望月','小山'
];
const KANA_LAST = [
    'タナカ','ヤマダ','サトウ','スズキ','タカハシ','イトウ','ワタナベ','ナカムラ','コバヤシ','カトウ',
    'ヨシダ','ヤマモト','マツモト','イノウエ','キムラ','ハヤシ','シミズ','ヤマグチ','アベ','イケダ',
    'ハシモト','モリ','イシカワ','マエダ','オガワ','フジタ','オカダ','ゴトウ','ハセガワ','ムラカミ',
    'コンドウ','イシイ','サイトウ','サカモト','エンドウ','アオキ','フジイ','ニシムラ','フクダ','オオタ',
    'ミウラ','オカモト','マツダ','ナカジマ','ナカノ','ハラダ','オノ','タムラ','タケウチ','カネコ',
    'ワダ','ナカヤマ','イシダ','ウエダ','モリタ','ハラ','シバタ','サカイ','クドウ','ヨコヤマ',
    'ミヤザキ','ミヤモト','ウチダ','タカギ','アンドウ','シマダ','タニグチ','オオノ','タカダ','マルヤマ',
    'イマイ','コウノ','フジワラ','コジマ','クボ','マツイ','チバ','イワサキ','サクライ','キノシタ',
    'ノグチ','マツオ','キクチ','ノムラ','アライ','ワタベ','ササキ','スギヤマ','フルカワ','ヒラノ',
    'ヤマシタ','ホンダ','スギモト','ハマダ','イイダ','イチカワ','オオツカ','タケダ','モチヅキ','コヤマ'
];
const FIRST_M = ['太郎','一郎','健太','大輔','翔太','拓也','直樹','達也','和也','雄太','洋平','亮','誠','浩','剛','学','修','博','豊','正','隆','茂','進','勝','清','実','弘','明','光','秀樹','裕介','康平','慎太郎','悠太','颯太','蓮','陽斗','朝陽','湊','樹','陸','悠真','大和','翔','陽翔','結翔','悠人','駿','壮太','健'];
const FIRST_F = ['花子','美咲','陽子','恵子','裕子','京子','幸子','和子','節子','洋子','明美','久美子','真理子','智子','由美','直美','美穂','千恵','理恵','麻衣','さくら','結衣','凛','陽菜','葵','芽依','莉子','美月','心春','楓','杏','紬','琴音','彩花','美羽','優花','遥','七海','真央','愛菜','芽生','柚希','日向','結菜','朱莉','美桜','咲良','花音','心結','里奈'];
const KANA_M = ['タロウ','イチロウ','ケンタ','ダイスケ','ショウタ','タクヤ','ナオキ','タツヤ','カズヤ','ユウタ','ヨウヘイ','リョウ','マコト','ヒロシ','ツヨシ','マナブ','オサム','ヒロシ','ユタカ','タダシ'];
const KANA_F = ['ハナコ','ミサキ','ヨウコ','ケイコ','ユウコ','キョウコ','サチコ','カズコ','セツコ','ヨウコ','アケミ','クミコ','マリコ','トモコ','ユミ','ナオミ','ミホ','チエ','リエ','マイ'];

const PREFECTURES = ['東京都','神奈川県','大阪府','愛知県','埼玉県','千葉県','兵庫県','北海道','福岡県','静岡県','茨城県','広島県','京都府','宮城県','新潟県','長野県'];
const CITIES = ['中央区本町1-2-3','港区南青山4-5-6','新宿区西新宿7-8-9','渋谷区恵比寿2-10-5','豊島区池袋3-1-1','品川区大崎5-12-3','世田谷区三軒茶屋8-4-2','目黒区自由が丘1-1-1','横浜市中区山下町3-7-2','川崎市中原区小杉6-9-1','名古屋市中区栄2-3-4','大阪市北区梅田5-6-7','神戸市中央区三宮1-8-9','札幌市中央区大通3-2-1','福岡市博多区博多駅前4-5-6','仙台市青葉区一番町7-8-9'];
const PRACTITIONERS = ['山田太郎','佐藤花子','鈴木一郎','田中美咲','高橋誠','伊藤洋平','渡辺直美','中村健太','小林裕子','加藤修'];
const RELATIONSHIPS = ['配偶者','子','親','兄弟','姉妹','義親','友人'];

const ALLERGENS = [
    {allergen:'ペニシリン',severity:'severe',note:'アナフィラキシー歴あり'},
    {allergen:'セフェム系抗菌薬',severity:'moderate',note:'発疹あり'},
    {allergen:'アスピリン',severity:'moderate',note:'喘息発作誘発'},
    {allergen:'スギ花粉',severity:'mild',note:'季節性鼻炎'},
    {allergen:'ダニ',severity:'mild',note:'通年性鼻炎'},
    {allergen:'ハウスダスト',severity:'mild',note:'アレルギー性鼻炎'},
    {allergen:'卵',severity:'moderate',note:'蕁麻疹'},
    {allergen:'小麦',severity:'severe',note:'アナフィラキシーリスク'},
    {allergen:'そば',severity:'severe',note:'重篤なアレルギー'},
    {allergen:'牛乳',severity:'mild',note:'腹部膨満感'},
    {allergen:'エビ',severity:'moderate',note:'口腔アレルギー'},
    {allergen:'ラテックス',severity:'moderate',note:'接触性皮膚炎'},
    {allergen:'ヨード造影剤',severity:'severe',note:'使用禁忌'},
    {allergen:'サルファ剤',severity:'moderate',note:'薬疹'},
    {allergen:'ネコ',severity:'mild',note:'接触で鼻炎'},
];

const MED_HISTORIES = [
    {disease:'高血圧症',p:[2010,2023],note:'内服加療中'},
    {disease:'2型糖尿病',p:[2008,2022],note:'HbA1c管理中'},
    {disease:'脂質異常症',p:[2012,2024],note:'スタチン服用'},
    {disease:'気管支喘息',p:[1995,2020],note:'吸入ステロイド使用'},
    {disease:'虫垂炎',p:[2000,2020],note:'虫垂切除術施行'},
    {disease:'胆石症',p:[2010,2023],note:'腹腔鏡下胆嚢摘出術'},
    {disease:'片頭痛',p:[2005,2023],note:'発作時トリプタン使用'},
    {disease:'逆流性食道炎',p:[2015,2024],note:'PPI服用'},
    {disease:'腰椎椎間板ヘルニア',p:[2010,2022],note:'保存的加療'},
    {disease:'痛風',p:[2013,2024],note:'尿酸降下薬服用'},
    {disease:'うつ病',p:[2018,2024],note:'SSRI服用中'},
    {disease:'甲状腺機能低下症',p:[2015,2024],note:'レボチロキシン服用'},
    {disease:'鉄欠乏性貧血',p:[2016,2023],note:'鉄剤服用歴'},
    {disease:'帯状疱疹',p:[2019,2024],note:'左肋間に発症'},
    {disease:'肺炎',p:[2017,2023],note:'入院加療歴あり'},
    {disease:'骨折（左橈骨）',p:[2005,2022],note:'ギプス固定'},
    {disease:'花粉症',p:[2000,2024],note:'毎年2-5月に悪化'},
    {disease:'不整脈（心房細動）',p:[2020,2024],note:'抗凝固薬服用'},
    {disease:'前立腺肥大症',p:[2018,2024],note:'α遮断薬服用'},
    {disease:'子宮筋腫',p:[2012,2023],note:'経過観察中'},
];

// --- SOAP テンプレート ---
const SOAP_S = [
    '3日前から咳と痰が続いている。黄色い痰が出る。発熱はない。',
    '昨日から38.5度の発熱があり、全身倦怠感を伴う。関節痛もある。',
    '1週間前から左膝の痛みが悪化。階段の昇り降りがつらい。',
    '朝起きたときにめまいがする。ふわふわした感じ。吐き気はない。',
    '2日前から腹痛があり、下痢を繰り返している。血便はない。',
    '頭痛が週に2-3回ある。こめかみがズキズキする。光が眩しい。',
    '胸がチクチクする。安静時にも感じる。息切れはない。',
    '背中が痛い。特に朝起きたときがひどい。運動すると楽になる。',
    '最近疲れやすく、以前より階段で息切れする。体重が増えた。',
    '皮膚にかゆみのある赤い発疹が出た。両腕の内側に多い。',
    '喉が痛くて飲み込みにくい。声が枯れている。咳はない。',
    '足がむくむ。特に夕方にひどくなる。靴がきつくなった。',
    '最近よく眠れない。寝つきが悪く、途中で何度も目が覚める。',
    '食後に胃がもたれる。げっぷが多い。食欲は普通。',
    '動悸がする。急にドキドキして不安になる。安静にすると落ち着く。',
    '2週間前から右肩が上がらない。夜間痛がある。',
    '目がかすむ。特にパソコン作業後にひどい。頭痛も伴う。',
    '耳鳴りがする。キーンという高い音。左側が強い。',
    '便秘が2週間続いている。お腹が張って苦しい。',
    '尿の回数が増えた。特に夜間に3回以上トイレに起きる。',
    '手指の関節が痛い。朝のこわばりが30分以上続く。',
    '微熱が1週間以上続いている。37.2-37.5度程度。倦怠感あり。',
    '咳が2週間以上続く。痰は少ない。夜間にひどくなる。',
    '腰痛がある。右側に放散する痛み。しびれはない。',
    '体重が3ヶ月で5kg減った。食欲は変わらない。',
    '鼻水と鼻づまりが続いている。くしゃみが多い。目もかゆい。',
    '胸やけがする。食後や横になると悪化する。',
    '足のしびれがある。両足の先から始まった。冷感もある。',
    '口内炎が繰り返しできる。痛くて食事がつらい。',
    '血圧が高いと指摘された。自覚症状は特にない。',
    '前回処方の薬が効いている。症状は改善傾向。',
    '特に症状の変化なし。定期受診。',
    '風邪をひいた。くしゃみ、鼻水、微熱。',
    '健診で血糖値が高いと言われた。口渇、多尿の自覚あり。',
    '腹部膨満感がある。ガスが多い。排便は1日1回。',
];
const SOAP_O = [
    '体温36.8度。咽頭発赤軽度。胸部聴診で右下肺野にラ音あり。',
    '体温38.2度。咽頭発赤(+)、扁桃腫大(+)。頸部リンパ節腫脹あり。',
    '左膝関節腫脹(+)。可動域制限あり。McMurray test(-)。圧痛(+)。',
    'Romberg test(-)。眼振なし。起立性血圧変動あり。',
    '腹部圧痛(+) 臍周囲。筋性防御(-)。腸蠕動音亢進。',
    '神経学的所見異常なし。項部硬直(-)。視力低下なし。',
    '胸部聴診清。心音整。心雑音なし。呼吸音正常。',
    '脊柱起立筋の圧痛(+)。SLRテスト(-)。腱反射正常。',
    '下腿浮腫(+) 両側。頸静脈怒張(-)。肺うっ血所見なし。',
    '両側前腕屈側に紅斑性丘疹あり。掻破痕(+)。膿疱(-)。',
    '咽頭発赤著明。白苔付着。体温37.5度。開口制限なし。',
    '両側下腿圧痕性浮腫(+)。Homan sign(-)。',
    '表情やや暗い。問診に対する応答は良好。理路整然。',
    '腹部膨満(-)。圧痛(-)。肝脾触知せず。',
    '脈拍整。心拍数88/分。心電図上PVC散発。',
    '右肩関節外転90度で疼痛(+)。棘上筋テスト(+)。',
    '視力 右0.7 左0.8 (矯正)。眼底所見異常なし。',
    '両側鼓膜正常。Weber test 偏位なし。',
    '腹部膨満(+)。腸蠕動音減弱。直腸診で便塊触知。',
    '前立腺肥大 推定40g。残尿感あり。',
    'DIP/PIP関節腫脹(+)。朝のこわばり45分。握力低下。',
    '体温37.3度。CRP 1.2mg/dL。白血球 8,200。',
    '体温36.5度。SpO2 97%。胸部X線異常なし。',
    '腰部傍脊柱筋圧痛(+)。下肢伸展挙上テスト右陽性。',
    'BMI 21.3。栄養状態良好。貧血所見なし。',
    '鼻粘膜蒼白腫脹。鼻汁水様性。結膜充血(+)。',
    '心窩部圧痛(+)。腹部膨満(-)。Murphy sign(-)。',
    '両足底感覚鈍麻。アキレス腱反射減弱。振動覚低下。',
    '口腔粘膜にアフタ2個。発赤・腫脹あり。',
    '血圧 158/96mmHg。心音整、心雑音なし。眼底 KW II度。',
    '前回比で症状改善。バイタル安定。',
    '特記所見なし。全身状態良好。',
    '咽頭軽度発赤。体温37.1度。胸部聴診清。',
    '空腹時血糖 142mg/dL。HbA1c 7.2%。BMI 26.8。',
    '腹部聴診：腸蠕動音正常。打診：鼓音。触診：圧痛(-)。',
];
const SOAP_A = [
    '急性上気道炎','急性気管支炎','インフルエンザ疑い',
    '変形性膝関節症','良性発作性頭位めまい症','感染性胃腸炎',
    '片頭痛','肋間神経痛','心不全疑い（NYHA II度）',
    '接触性皮膚炎','急性扁桃炎','下肢浮腫（静脈不全疑い）',
    '不眠症','機能性ディスペプシア','発作性上室性頻拍',
    '肩関節周囲炎（五十肩）','VDT症候群','突発性難聴',
    '慢性便秘症','前立腺肥大症','関節リウマチ疑い',
    '不明熱（精査中）','咳喘息','腰椎椎間板ヘルニア',
    '体重減少（原因精査要）','アレルギー性鼻炎','逆流性食道炎',
    '糖尿病性神経障害','再発性アフタ性口内炎','本態性高血圧症',
    '経過良好','安定','急性上気道炎（感冒）',
    '2型糖尿病','機能性腹部膨満',
];
const SOAP_P = [
    '抗菌薬処方。3日後再診。咳が悪化すれば早期受診を指示。',
    '解熱鎮痛薬処方。安静指示。水分摂取励行。インフルエンザ迅速検査施行。',
    'NSAIDs処方。膝サポーター装着指導。リハビリテーション処方。',
    'メクリジン処方。頭位変換療法施行。1週間後再診。',
    '整腸剤・制吐薬処方。食事指導（消化の良いもの）。脱水注意。',
    'トリプタン処方。頭痛ダイアリー記録を指示。MRI検討。',
    'NSAIDs処方。肋骨X線撮影。疼痛コントロール。',
    '心エコー・BNP検査オーダー。利尿薬開始検討。塩分制限指導。',
    'ステロイド外用薬処方。原因物質の回避指導。1週間後再診。',
    '抗菌薬処方。うがい指示。症状改善なければ血液検査。',
    '弾性ストッキング指導。下肢挙上。エコー検査予約。',
    '睡眠衛生指導。短時間型睡眠薬処方（2週間分）。',
    'PPI処方。食事指導。上部消化管内視鏡検査予約。',
    'β遮断薬処方。ホルター心電図検査予約。',
    '肩関節注射施行。リハビリ処方。NSAIDs頓用。',
    '点眼薬処方。VDT作業の休憩指導。1ヶ月後再診。',
    'ステロイド内服開始。聴力検査予約。安静指示。',
    '酸化マグネシウム処方。食物繊維摂取指導。運動推奨。',
    'α遮断薬処方。泌尿器科紹介状作成。',
    '抗リウマチ薬開始検討。RF・抗CCP抗体検査オーダー。',
    '血液培養追加。CT検査予約。経過観察入院検討。',
    '吸入ステロイド処方。呼吸機能検査予約。',
    'NSAIDs処方。MRI検査予約。腰椎コルセット処方。',
    '腫瘍マーカー検査オーダー。上下部内視鏡検査予約。CT検査。',
    '抗ヒスタミン薬処方。点鼻ステロイド。環境整備指導。',
    'PPI増量。食事指導。就寝前の食事回避。',
    '血糖コントロール強化。メコバラミン処方。フットケア指導。',
    'ケナログ口腔用軟膏処方。ビタミンB群処方。',
    '降圧薬開始（ARB）。減塩指導。1ヶ月後再診で効果判定。',
    '現行治療継続。次回1ヶ月後再診。',
    '経過観察。生活指導。次回定期受診。',
    '感冒薬処方。安静・保温・水分摂取を指示。',
    'メトホルミン開始。食事・運動療法指導。HbA1c 1ヶ月後再検。',
    '整腸剤処方。腹部X線撮影。生活指導。',
    '処方継続。次回検査予約。',
];
const TREATMENT_MEMOS = [
    null,null,null,null,null,
    '創部消毒・ガーゼ交換施行','関節内注射施行（トリアムシノロン）',
    '肩関節ブロック注射施行','膝関節穿刺（関節液排出30ml）',
    '点滴施行（生食500ml + セフトリアキソン1g）','足底のタコ処置（角質除去）',
    '耳垢除去処置','ネブライザー吸入施行','心電図検査施行',
    'インフルエンザ迅速検査施行',null,null,null,null,null,
];

// --- 処方マスタ ---
const MEDICINES = [
    {medicine:'ロキソプロフェンNa錠60mg',dosage:'1回1錠',frequency:'1日3回 毎食後',days:[5,7,14]},
    {medicine:'アセトアミノフェン錠200mg',dosage:'1回2錠',frequency:'1日3回 毎食後',days:[3,5,7]},
    {medicine:'セレコキシブ錠100mg',dosage:'1回1錠',frequency:'1日2回 朝夕食後',days:[7,14,28]},
    {medicine:'アモキシシリンカプセル250mg',dosage:'1回1カプセル',frequency:'1日3回 毎食後',days:[5,7]},
    {medicine:'クラリスロマイシン錠200mg',dosage:'1回1錠',frequency:'1日2回 朝夕食後',days:[5,7]},
    {medicine:'レボフロキサシン錠500mg',dosage:'1回1錠',frequency:'1日1回 朝食後',days:[5,7]},
    {medicine:'セフカペンピボキシル錠100mg',dosage:'1回1錠',frequency:'1日3回 毎食後',days:[5,7]},
    {medicine:'ランソプラゾールOD錠15mg',dosage:'1回1錠',frequency:'1日1回 朝食前',days:[14,28,56]},
    {medicine:'レバミピド錠100mg',dosage:'1回1錠',frequency:'1日3回 毎食後',days:[14,28]},
    {medicine:'モサプリドクエン酸塩錠5mg',dosage:'1回1錠',frequency:'1日3回 毎食前',days:[14,28]},
    {medicine:'酸化マグネシウム錠330mg',dosage:'1回1錠',frequency:'1日3回 毎食後',days:[14,28,56]},
    {medicine:'アムロジピン錠5mg',dosage:'1回1錠',frequency:'1日1回 朝食後',days:[28,56,90]},
    {medicine:'オルメサルタン錠20mg',dosage:'1回1錠',frequency:'1日1回 朝食後',days:[28,56,90]},
    {medicine:'カンデサルタン錠8mg',dosage:'1回1錠',frequency:'1日1回 朝食後',days:[28,56,90]},
    {medicine:'メトホルミン塩酸塩錠250mg',dosage:'1回1錠',frequency:'1日2回 朝夕食後',days:[28,56,90]},
    {medicine:'シタグリプチンリン酸塩錠50mg',dosage:'1回1錠',frequency:'1日1回 朝食後',days:[28,56]},
    {medicine:'ロスバスタチン錠2.5mg',dosage:'1回1錠',frequency:'1日1回 夕食後',days:[28,56,90]},
    {medicine:'アトルバスタチン錠10mg',dosage:'1回1錠',frequency:'1日1回 夕食後',days:[28,56,90]},
    {medicine:'フェキソフェナジン塩酸塩錠60mg',dosage:'1回1錠',frequency:'1日2回 朝夕食後',days:[14,28,56]},
    {medicine:'ロラタジン錠10mg',dosage:'1回1錠',frequency:'1日1回 就寝前',days:[14,28]},
    {medicine:'オロパタジン塩酸塩錠5mg',dosage:'1回1錠',frequency:'1日2回 朝夕食後',days:[14,28]},
    {medicine:'ゾルピデム酒石酸塩錠5mg',dosage:'1回1錠',frequency:'1日1回 就寝前',days:[14,28]},
    {medicine:'スボレキサント錠15mg',dosage:'1回1錠',frequency:'1日1回 就寝前',days:[14,28]},
    {medicine:'デキストロメトルファン錠15mg',dosage:'1回1錠',frequency:'1日3回 毎食後',days:[5,7]},
    {medicine:'カルボシステイン錠500mg',dosage:'1回1錠',frequency:'1日3回 毎食後',days:[5,7,14]},
    {medicine:'葛根湯エキス顆粒（ツムラ1番）',dosage:'1回1包',frequency:'1日3回 毎食前',days:[5,7]},
    {medicine:'芍薬甘草湯エキス顆粒（ツムラ68番）',dosage:'1回1包',frequency:'1日2回 朝夕食前',days:[7,14]},
    {medicine:'補中益気湯エキス顆粒（ツムラ41番）',dosage:'1回1包',frequency:'1日3回 毎食前',days:[14,28]},
    {medicine:'六君子湯エキス顆粒（ツムラ43番）',dosage:'1回1包',frequency:'1日3回 毎食前',days:[14,28]},
    {medicine:'ベタメタゾン吉草酸エステルクリーム0.12%',dosage:'適量',frequency:'1日2回 患部に塗布',days:[7,14]},
    {medicine:'ヘパリン類似物質クリーム0.3%',dosage:'適量',frequency:'1日2-3回 患部に塗布',days:[14,28]},
    {medicine:'ケトプロフェンテープ20mg',dosage:'1日1枚',frequency:'1日1回 患部に貼付',days:[7,14,28]},
    {medicine:'ヒアルロン酸Na点眼液0.1%',dosage:'1回1滴',frequency:'1日5-6回 両眼',days:[28,56]},
    {medicine:'フルチカゾン吸入液50μg',dosage:'1回2吸入',frequency:'1日2回 朝夕',days:[28,56,90]},
    {medicine:'フェブキソスタット錠10mg',dosage:'1回1錠',frequency:'1日1回 朝食後',days:[28,56,90]},
    {medicine:'エスシタロプラムシュウ酸塩錠10mg',dosage:'1回1錠',frequency:'1日1回 夕食後',days:[28,56]},
    {medicine:'レボチロキシンNa錠50μg',dosage:'1回1錠',frequency:'1日1回 起床時',days:[56,90]},
    {medicine:'エドキサバン錠30mg',dosage:'1回1錠',frequency:'1日1回 朝食後',days:[28,56,90]},
    {medicine:'タムスロシン塩酸塩OD錠0.2mg',dosage:'1回1錠',frequency:'1日1回 朝食後',days:[28,56]},
    {medicine:'ビオフェルミン配合散',dosage:'1回1g',frequency:'1日3回 毎食後',days:[7,14,28]},
    {medicine:'メコバラミン錠500μg',dosage:'1回1錠',frequency:'1日3回 毎食後',days:[28,56]},
];
const RX_MEMOS = [null,null,null,null,null,'食前服用厳守','空腹時服用','眠気注意','運転注意','副作用出現時中止','定期採血時に薬効確認','残薬あり2週間分','自己判断で中止しないよう指導','次回採血結果で用量調整予定'];

// --- 検査マスタ ---
const BLOOD_TESTS = [
    {itemName:'白血球数 (WBC)',unit:'/μL',refMin:3300,refMax:8600,gen:()=>randInt(2800,15000)},
    {itemName:'赤血球数 (RBC)',unit:'万/μL',refMin:386,refMax:492,gen:()=>randInt(320,550)},
    {itemName:'ヘモグロビン (Hb)',unit:'g/dL',refMin:11.6,refMax:14.8,gen:()=>randFloat(9.5,18.0)},
    {itemName:'ヘマトクリット (Ht)',unit:'%',refMin:35.1,refMax:44.4,gen:()=>randFloat(28,52)},
    {itemName:'血小板数 (PLT)',unit:'万/μL',refMin:15.8,refMax:34.8,gen:()=>randFloat(10,45)},
    {itemName:'AST (GOT)',unit:'U/L',refMin:13,refMax:30,gen:()=>randInt(8,120)},
    {itemName:'ALT (GPT)',unit:'U/L',refMin:7,refMax:23,gen:()=>randInt(5,150)},
    {itemName:'γ-GTP',unit:'U/L',refMin:9,refMax:32,gen:()=>randInt(6,200)},
    {itemName:'総ビリルビン',unit:'mg/dL',refMin:0.4,refMax:1.5,gen:()=>randFloat(0.2,3.0)},
    {itemName:'アルブミン',unit:'g/dL',refMin:4.1,refMax:5.1,gen:()=>randFloat(2.5,5.5)},
    {itemName:'総蛋白 (TP)',unit:'g/dL',refMin:6.6,refMax:8.1,gen:()=>randFloat(5.5,9.0)},
    {itemName:'BUN (尿素窒素)',unit:'mg/dL',refMin:8,refMax:20,gen:()=>randFloat(5,40)},
    {itemName:'クレアチニン (Cr)',unit:'mg/dL',refMin:0.46,refMax:0.79,gen:()=>randFloat(0.3,2.5)},
    {itemName:'尿酸 (UA)',unit:'mg/dL',refMin:2.6,refMax:5.5,gen:()=>randFloat(2.0,10.0)},
    {itemName:'Na',unit:'mEq/L',refMin:138,refMax:145,gen:()=>randInt(130,152)},
    {itemName:'K',unit:'mEq/L',refMin:3.6,refMax:4.8,gen:()=>randFloat(3.0,6.0)},
    {itemName:'Cl',unit:'mEq/L',refMin:101,refMax:108,gen:()=>randInt(95,115)},
    {itemName:'CRP',unit:'mg/dL',refMin:0,refMax:0.14,gen:()=>randFloat(0,8.0)},
    {itemName:'空腹時血糖',unit:'mg/dL',refMin:73,refMax:109,gen:()=>randInt(60,250)},
    {itemName:'HbA1c',unit:'%',refMin:4.9,refMax:6.0,gen:()=>randFloat(4.5,10.0)},
    {itemName:'総コレステロール',unit:'mg/dL',refMin:142,refMax:248,gen:()=>randInt(120,320)},
    {itemName:'LDLコレステロール',unit:'mg/dL',refMin:65,refMax:163,gen:()=>randInt(50,220)},
    {itemName:'HDLコレステロール',unit:'mg/dL',refMin:40,refMax:90,gen:()=>randInt(25,100)},
    {itemName:'中性脂肪 (TG)',unit:'mg/dL',refMin:40,refMax:150,gen:()=>randInt(30,400)},
    {itemName:'TSH',unit:'μIU/mL',refMin:0.5,refMax:5.0,gen:()=>randFloat(0.1,15.0)},
    {itemName:'Free T4',unit:'ng/dL',refMin:0.9,refMax:1.7,gen:()=>randFloat(0.4,3.0)},
    {itemName:'鉄 (Fe)',unit:'μg/dL',refMin:40,refMax:188,gen:()=>randInt(15,220)},
    {itemName:'フェリチン',unit:'ng/mL',refMin:10,refMax:120,gen:()=>randFloat(3,300)},
    {itemName:'PT-INR',unit:'',refMin:0.9,refMax:1.1,gen:()=>randFloat(0.8,3.5)},
    {itemName:'BNP',unit:'pg/mL',refMin:0,refMax:18.4,gen:()=>randFloat(0,200)},
];
const URINE_TESTS = [
    {itemName:'尿蛋白',unit:'',refMin:null,refMax:null,values:['(-)','(±)','(+)','(2+)','(3+)']},
    {itemName:'尿糖',unit:'',refMin:null,refMax:null,values:['(-)','(±)','(+)','(2+)']},
    {itemName:'尿潜血',unit:'',refMin:null,refMax:null,values:['(-)','(±)','(+)','(2+)','(3+)']},
    {itemName:'尿比重',unit:'',refMin:1.005,refMax:1.030,gen:()=>randFloat(1.001,1.040,3)},
    {itemName:'pH',unit:'',refMin:5.0,refMax:7.5,gen:()=>randFloat(4.5,8.5)},
    {itemName:'白血球',unit:'/HPF',refMin:0,refMax:4,gen:()=>randInt(0,50)},
    {itemName:'赤血球',unit:'/HPF',refMin:0,refMax:4,gen:()=>randInt(0,30)},
    {itemName:'ケトン体',unit:'',refMin:null,refMax:null,values:['(-)','(±)','(+)','(2+)']},
];
const IMAGE_TESTS = [
    {itemName:'胸部X線',values:['異常なし','心陰影拡大','肺野浸潤影あり','胸水貯留','CPangle鈍化','肺門部腫大なし']},
    {itemName:'腹部X線',values:['異常なし','腸管ガス軽度増加','ニボー像なし','腰椎変性所見','石灰化影なし']},
    {itemName:'心電図',values:['正常洞調律','洞性頻脈','洞性徐脈','PVC散発','左室肥大所見','ST変化なし','心房細動']},
    {itemName:'腹部エコー',values:['脂肪肝','胆嚢結石','腎嚢胞','異常所見なし','肝血管腫疑い','脾腫なし']},
    {itemName:'心エコー',values:['EF 65% 正常','EF 55%','軽度僧帽弁逆流','左室壁運動正常','弁膜症なし']},
    {itemName:'頸動脈エコー',values:['IMT 0.8mm 正常範囲','IMT 1.2mm 肥厚','プラークなし','軽度プラークあり']},
    {itemName:'骨密度検査 (DXA)',values:['YAM 95% 正常','YAM 78% 骨量減少','YAM 65% 骨粗鬆症','YAM 88% 正常範囲']},
];
const OTHER_TESTS = [
    {itemName:'インフルエンザ迅速検査',values:['A型(+)','B型(+)','陰性','陰性','陰性']},
    {itemName:'溶連菌迅速検査',values:['陽性','陰性','陰性','陰性']},
    {itemName:'便潜血検査',values:['陰性','陰性','陽性','陰性','陰性']},
    {itemName:'視力検査',values:['右1.0 左1.0','右0.7 左0.8','右0.5 左0.6','右1.2 左1.2']},
    {itemName:'聴力検査',values:['正常','左高音域軽度低下','両側高音域低下','正常']},
    {itemName:'呼吸機能検査',values:['FEV1.0% 82% 正常','FEV1.0% 72% 軽度閉塞性','FVC 正常','%VC 94% 正常']},
    {itemName:'PSA',unit:'ng/mL',refMin:0,refMax:4.0,gen:()=>randFloat(0.2,12.0)},
];
const LAB_MEMOS = [null,null,null,null,null,null,'前回値より改善','経過観察','要再検','食事指導後再検予定','次回採血時に確認','基準範囲内に改善','空腹時採血','随時採血'];

// ============================================================
// 生成関数
// ============================================================
function genPhone() {
    const area = pick(['03','06','045','052','048','043','078','011','092','022']);
    return `${area}-${randInt(1000,9999)}-${randInt(1000,9999)}`;
}

function generatePatient(i) {
    const male = Math.random() < 0.5;
    const li = i % LAST_NAMES.length;
    const name = LAST_NAMES[li] + ' ' + pick(male ? FIRST_M : FIRST_F);
    const nameKana = KANA_LAST[li] + ' ' + pick(male ? KANA_M : KANA_F);
    const age = randInt(5, 92);
    const birthDate = `${2026-age}-${String(randInt(1,12)).padStart(2,'0')}-${String(randInt(1,28)).padStart(2,'0')}`;

    const allergies = Math.random() < 0.35 ? pickN(ALLERGENS, randInt(1,3)) : [];
    const medicalHistory = Math.random() < 0.5
        ? pickN(MED_HISTORIES, randInt(1,4)).map(h => ({disease:h.disease, diagnosedAt:randDate(h.p[0],h.p[1]), note:h.note}))
        : [];
    const emergencyContact = Math.random() < 0.6
        ? {name:pick(LAST_NAMES)+pick(FIRST_M.slice(0,5).concat(FIRST_F.slice(0,5))), relationship:pick(RELATIONSHIPS), phone:genPhone()}
        : null;
    const firstVisit = randDate(2020, 2025);
    const now = new Date().toISOString();

    return {
        id: uuid(), patientCode: padCode(i+1), name, nameKana, birthDate,
        gender: male ? 'male' : 'female', phone: genPhone(),
        email: Math.random()<0.7 ? `patient${randInt(1,9999)}@example.com` : null,
        insuranceNumber: Math.random()<0.85 ? String(randInt(10000000,99999999)) : null,
        address: Math.random()<0.8 ? pick(PREFECTURES)+pick(CITIES) : null,
        emergencyContact, firstVisitDate: firstVisit, practitioner: pick(PRACTITIONERS),
        memo: Math.random()<0.2 ? pick(['要注意患者（転倒リスク高）','難聴あり、大きな声で話す','車椅子使用','介護保険利用中','ペースメーカー装着','透析患者','在宅酸素療法中','認知症あり（付添い必要）','インスリン自己注射指導済み','禁煙外来通院中']) : null,
        allergies, medicalHistory,
        createdAt: new Date(firstVisit+'T09:00:00').toISOString(), updatedAt: now
    };
}

function generateRecords(patient, count) {
    const records = [];
    const start = new Date(patient.firstVisitDate).getTime();
    const end = new Date('2026-02-15').getTime();
    const span = Math.max(1, end - start);
    const baseTemp = randFloat(36.0,36.6);
    const baseSys = randInt(110,150); const baseDia = randInt(60,95);
    const basePulse = randInt(60,85);
    const baseWeight = randFloat(40,90); const baseHeight = randFloat(148,182);

    for (let i = 0; i < count; i++) {
        const vd = new Date(start + (span / count) * i);
        vd.setHours(randInt(8,17), randInt(0,59), randInt(0,59));
        const ts = vd.toISOString();
        const idx = i % SOAP_S.length;
        const hasV = Math.random() < 0.85;
        const fever = Math.random() < 0.1;

        records.push({
            id: uuid(), patientId: patient.id, visitedAt: ts,
            soap: { subjective: SOAP_S[idx], objective: SOAP_O[idx], assessment: SOAP_A[idx], plan: SOAP_P[idx] },
            vitals: hasV ? {
                temperature: fever ? randFloat(37.5,39.5) : randFloat(baseTemp-0.3, baseTemp+0.4),
                systolic: baseSys+randInt(-15,20), diastolic: baseDia+randInt(-10,15),
                pulse: basePulse+randInt(-10,20),
                spo2: Math.random()<0.9 ? randInt(95,100) : randInt(90,94),
                respiratoryRate: Math.random()<0.5 ? randInt(14,22) : null,
                weight: Math.random()<0.6 ? randFloat(baseWeight-2, baseWeight+2) : null,
                height: i===0 ? baseHeight : null
            } : {temperature:null,systolic:null,diastolic:null,pulse:null,spo2:null,respiratoryRate:null,weight:null,height:null},
            treatmentMemo: pick(TREATMENT_MEMOS),
            createdAt: ts, updatedAt: ts
        });
    }
    return records;
}

function generatePrescriptions(patient, count) {
    const rxs = [];
    const start = new Date(patient.firstVisitDate).getTime();
    const end = new Date('2026-02-15').getTime();
    const span = Math.max(1, end - start);
    for (let i = 0; i < count; i++) {
        const d = new Date(start + (span/count)*i);
        const ds = d.toISOString().split('T')[0];
        const ts = d.toISOString();
        const med = pick(MEDICINES);
        rxs.push({
            id:uuid(), patientId:patient.id, prescribedAt:ds,
            medicine:med.medicine, dosage:med.dosage, frequency:med.frequency, days:pick(med.days),
            memo:pick(RX_MEMOS), createdAt:ts, updatedAt:ts
        });
    }
    return rxs;
}

function judgeValue(v, min, max) {
    if (min===null||max===null) return null;
    if (v<min||v>max) { const dev = v<min?(min-v)/min:(v-max)/max; return dev>0.3?'abnormal':'caution'; }
    return 'normal';
}

function generateLabResults(patient, count) {
    const results = [];
    const start = new Date(patient.firstVisitDate).getTime();
    const end = new Date('2026-02-15').getTime();
    const span = Math.max(1, end - start);

    for (let i = 0; i < count; i++) {
        const d = new Date(start + (span/count)*i);
        const ds = d.toISOString().split('T')[0];
        const ts = d.toISOString();
        const r = Math.random();
        let category, item, value, unit, refMin, refMax, judgment;

        if (r < 0.60) {
            category='blood'; const t=pick(BLOOD_TESTS); const nv=t.gen();
            item=t.itemName; value=String(nv); unit=t.unit; refMin=t.refMin; refMax=t.refMax; judgment=judgeValue(nv,refMin,refMax);
        } else if (r < 0.75) {
            category='urine'; const t=pick(URINE_TESTS); item=t.itemName; unit=t.unit||null;
            if(t.values){value=pick(t.values);refMin=null;refMax=null;judgment=value==='(-)'?'normal':(value==='(±)'?'caution':'abnormal');}
            else{const nv=t.gen();value=String(nv);refMin=t.refMin;refMax=t.refMax;judgment=judgeValue(nv,refMin,refMax);}
        } else if (r < 0.90) {
            category='image'; const t=pick(IMAGE_TESTS); item=t.itemName; value=pick(t.values);
            unit=null;refMin=null;refMax=null; judgment=(value==='異常なし'||value==='正常洞調律'||value.includes('正常'))?'normal':'caution';
        } else {
            category='other'; const t=pick(OTHER_TESTS); item=t.itemName;
            if(t.values){value=pick(t.values);unit=t.unit||null;refMin=null;refMax=null;judgment=(value==='陰性'||value.includes('正常'))?'normal':'caution';}
            else{const nv=t.gen();value=String(nv);unit=t.unit;refMin=t.refMin;refMax=t.refMax;judgment=judgeValue(nv,refMin,refMax);}
        }
        results.push({
            id:uuid(), patientId:patient.id, examinedAt:ds, category, itemName:item,
            value, unit, referenceMin:refMin, referenceMax:refMax, judgment, memo:pick(LAB_MEMOS),
            createdAt:ts, updatedAt:ts
        });
    }
    return results;
}

// ============================================================
// メイン
// ============================================================
function main() {
    const N=100, R=100, P=100, L=100;
    console.log(`生成開始: 患者${N} × カルテ${R} × 処方${P} × 検査${L}`);

    const patients=[], records=[], prescriptions=[], labResults=[];
    for (let i=0; i<N; i++) {
        if((i+1)%10===0) process.stdout.write(`  ${i+1}/${N}...\r`);
        const pt = generatePatient(i);
        patients.push(pt);
        records.push(...generateRecords(pt, R));
        prescriptions.push(...generatePrescriptions(pt, P));
        labResults.push(...generateLabResults(pt, L));
    }

    const data = {
        version:'1.0.0', appName:'emr', exportedAt:new Date().toISOString(),
        patients, records, prescriptions, labResults,
        media:[], aiMemo:'',
        displaySettings:{id:'display_settings',tabs:{patients:{visible:true,label:'患者一覧'},karte:{visible:true,label:'カルテ'},prescription:{visible:true,label:'処方'},lab:{visible:true,label:'検査'},ai:{visible:true,label:'AI'},data:{visible:true,label:'データ'}},fields:{}}
    };

    const out = path.join(__dirname, '..', 'sample_data.json');
    const json = JSON.stringify(data);
    fs.writeFileSync(out, json, 'utf8');
    const mb = (Buffer.byteLength(json)/1024/1024).toFixed(1);
    console.log(`\n完了！ ${out}`);
    console.log(`  患者:${patients.length} カルテ:${records.length} 処方:${prescriptions.length} 検査:${labResults.length}`);
    console.log(`  サイズ: ${mb} MB`);
}
main();

/**
 * emr.calc.test.js - 電子カルテ計算ロジックの単体テスト
 */
const {
    classifyBP,
    classifyBPClass,
    classifyBMI,
    classifySpo2,
    calcAge,
    validatePatient,
    validateVitals,
    validateImportData,
    calcVitalStats,
    judgeLabValue,
    generatePatientCode,
    parseSuggestions
} = require('./emr.calc');

// ============================================================
// 1.1 血圧分類
// ============================================================
describe('classifyBP - 血圧分類', () => {
    test('UT-BP-001: 正常血圧の判定 (sys=110, dia=70)', () => {
        expect(classifyBP(110, 70)).toBe('正常血圧');
    });

    test('UT-BP-002: 正常高値血圧の判定 (sys=120, dia=70)', () => {
        expect(classifyBP(120, 70)).toBe('正常高値血圧');
    });

    test('UT-BP-003: 高値血圧の判定 - 収縮期 (sys=130, dia=70)', () => {
        expect(classifyBP(130, 70)).toBe('高値血圧');
    });

    test('UT-BP-004: 高値血圧の判定 - 拡張期 (sys=110, dia=80)', () => {
        expect(classifyBP(110, 80)).toBe('高値血圧');
    });

    test('UT-BP-005: I度高血圧の判定 (sys=135, dia=85)', () => {
        expect(classifyBP(135, 85)).toBe('I度高血圧');
    });

    test('UT-BP-006: II度高血圧の判定 (sys=145, dia=90)', () => {
        expect(classifyBP(145, 90)).toBe('II度高血圧');
    });

    test('UT-BP-007: III度高血圧の判定 - 収縮期 (sys=160, dia=80)', () => {
        expect(classifyBP(160, 80)).toBe('III度高血圧');
    });

    test('UT-BP-008: III度高血圧の判定 - 拡張期 (sys=130, dia=100)', () => {
        expect(classifyBP(130, 100)).toBe('III度高血圧');
    });

    test('UT-BP-009: 境界値 - 正常/正常高値 (sys=114, dia=74)', () => {
        expect(classifyBP(114, 74)).toBe('正常血圧');
    });

    test('UT-BP-010: 境界値 - 正常高値/高値 (sys=115, dia=74)', () => {
        expect(classifyBP(115, 74)).toBe('正常高値血圧');
    });
});

// ============================================================
// 1.2 BMI計算・分類
// ============================================================
describe('classifyBMI - BMI計算・分類', () => {
    test('UT-BMI-001: 低体重の判定 (weight=45, height=170)', () => {
        const result = classifyBMI(45, 170);
        expect(result).not.toBeNull();
        expect(result.classification).toBe('低体重（やせ）');
        expect(result.bmi).toBeCloseTo(15.6, 1);
    });

    test('UT-BMI-002: 普通体重の判定 (weight=65, height=170)', () => {
        const result = classifyBMI(65, 170);
        expect(result).not.toBeNull();
        expect(result.classification).toBe('普通体重');
        expect(result.bmi).toBeCloseTo(22.5, 1);
    });

    test('UT-BMI-003: 肥満1度の判定 (weight=80, height=170)', () => {
        const result = classifyBMI(80, 170);
        expect(result).not.toBeNull();
        expect(result.classification).toBe('肥満（1度）');
        expect(result.bmi).toBeCloseTo(27.7, 1);
    });

    test('UT-BMI-004: 肥満2度の判定 (weight=95, height=170)', () => {
        const result = classifyBMI(95, 170);
        expect(result).not.toBeNull();
        expect(result.classification).toBe('肥満（2度）');
        expect(result.bmi).toBeCloseTo(32.9, 1);
    });

    test('UT-BMI-005: null入力 (weight=null, height=170)', () => {
        expect(classifyBMI(null, 170)).toBeNull();
    });

    test('UT-BMI-006: BMI計算精度 (weight=70, height=175)', () => {
        const result = classifyBMI(70, 175);
        expect(result).not.toBeNull();
        expect(result.classification).toBe('普通体重');
        expect(result.bmi).toBeCloseTo(22.9, 1);
    });
});

// ============================================================
// 1.3 SpO2分類
// ============================================================
describe('classifySpo2 - SpO2分類', () => {
    test('UT-SPO2-001: 正常の判定 (spo2=98)', () => {
        expect(classifySpo2(98)).toEqual({ label: '正常', level: 'normal' });
    });

    test('UT-SPO2-002: 軽度低下の判定 (spo2=93)', () => {
        expect(classifySpo2(93)).toEqual({ label: '軽度低下', level: 'caution' });
    });

    test('UT-SPO2-003: 中等度低下の判定 (spo2=88)', () => {
        expect(classifySpo2(88)).toEqual({ label: '中等度低下', level: 'warning' });
    });

    test('UT-SPO2-004: 重度低下の判定 (spo2=82)', () => {
        expect(classifySpo2(82)).toEqual({ label: '重度低下', level: 'danger' });
    });

    test('UT-SPO2-005: null入力', () => {
        expect(classifySpo2(null)).toBeNull();
    });

    test('UT-SPO2-006: 境界値 - 正常/軽度低下 (spo2=96)', () => {
        expect(classifySpo2(96)).toEqual({ label: '正常', level: 'normal' });
    });

    test('UT-SPO2-007: 境界値 - 軽度/中等度 (spo2=91)', () => {
        expect(classifySpo2(91)).toEqual({ label: '軽度低下', level: 'caution' });
    });
});

// ============================================================
// 1.4 年齢計算
// ============================================================
describe('calcAge - 年齢計算', () => {
    beforeAll(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-02-17'));
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    test('UT-AGE-001: 誕生日前 (1975-04-15 → 50歳)', () => {
        expect(calcAge('1975-04-15')).toBe(50);
    });

    test('UT-AGE-002: 誕生日当日 (1975-02-17 → 51歳)', () => {
        expect(calcAge('1975-02-17')).toBe(51);
    });

    test('UT-AGE-003: 誕生日翌日 (1975-02-18 → 50歳)', () => {
        expect(calcAge('1975-02-18')).toBe(50);
    });
});

// ============================================================
// 1.5 患者コード生成
// ============================================================
describe('generatePatientCode - 患者コード生成', () => {
    test('UT-PC-001: 患者なし（初回） → "P0001"', () => {
        expect(generatePatientCode([])).toBe('P0001');
    });

    test('UT-PC-002: 既存患者あり ["P0001","P0002"] → "P0003"', () => {
        expect(generatePatientCode(['P0001', 'P0002'])).toBe('P0003');
    });

    test('UT-PC-003: 飛び番あり ["P0001","P0003"] → "P0004"（最大値+1）', () => {
        expect(generatePatientCode(['P0001', 'P0003'])).toBe('P0004');
    });

    test('UT-PC-004: 4桁ゼロ埋め ["P0009"] → "P0010"', () => {
        expect(generatePatientCode(['P0009'])).toBe('P0010');
    });
});

// ============================================================
// 1.6 バイタルサイン統計
// ============================================================
describe('calcVitalStats - バイタルサイン統計', () => {
    test('UT-VS-001: 血圧平均値計算', () => {
        const records = [
            { vitals: { systolic: 120, diastolic: 80 } },
            { vitals: { systolic: 130, diastolic: 85 } }
        ];
        const result = calcVitalStats(records);
        expect(result.systolic.avg).toBe(125);
        expect(result.systolic.min).toBe(120);
        expect(result.systolic.max).toBe(130);
        expect(result.diastolic.avg).toBe(82.5);
        expect(result.diastolic.min).toBe(80);
        expect(result.diastolic.max).toBe(85);
    });

    test('UT-VS-002: 空配列 → 全フィールド null', () => {
        const result = calcVitalStats([]);
        expect(result.systolic).toEqual({ avg: null, min: null, max: null });
        expect(result.diastolic).toEqual({ avg: null, min: null, max: null });
        expect(result.temperature).toEqual({ avg: null, min: null, max: null });
        expect(result.pulse).toEqual({ avg: null, min: null, max: null });
        expect(result.spo2).toEqual({ avg: null, min: null, max: null });
    });

    test('UT-VS-003: null値含む → nullを除外して計算', () => {
        const records = [
            { vitals: { systolic: 120, diastolic: null } },
            { vitals: { systolic: 130, diastolic: 85 } }
        ];
        const result = calcVitalStats(records);
        expect(result.systolic.avg).toBe(125);
        expect(result.systolic.min).toBe(120);
        expect(result.systolic.max).toBe(130);
        expect(result.diastolic.avg).toBe(85);
        expect(result.diastolic.min).toBe(85);
        expect(result.diastolic.max).toBe(85);
    });
});

// ============================================================
// 1.7 バリデーション
// ============================================================
describe('validateVitals - バイタルサインバリデーション', () => {
    test('UT-VAL-001: 正常な血圧入力 (sys=120, dia=80)', () => {
        const result = validateVitals({ systolic: 120, diastolic: 80 });
        expect(result.valid).toBe(true);
    });

    test('UT-VAL-002: 収縮期が範囲外（低） (sys=40, dia=80)', () => {
        const result = validateVitals({ systolic: 40, diastolic: 80 });
        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
            expect.arrayContaining([
                expect.stringContaining('収縮期血圧は50〜300の範囲で入力してください')
            ])
        );
    });

    test('UT-VAL-003: 収縮期が範囲外（高） (sys=310, dia=80)', () => {
        const result = validateVitals({ systolic: 310, diastolic: 80 });
        expect(result.valid).toBe(false);
    });

    test('UT-VAL-004: 収縮期 <= 拡張期 (sys=80, dia=80)', () => {
        const result = validateVitals({ systolic: 80, diastolic: 80 });
        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
            expect.arrayContaining([
                expect.stringContaining('収縮期血圧は拡張期血圧より大きい値を入力してください')
            ])
        );
    });

    test('UT-VAL-005: 体温範囲外（低） (temperature=33.9)', () => {
        const result = validateVitals({ temperature: 33.9 });
        expect(result.valid).toBe(false);
    });

    test('UT-VAL-006: 体温範囲外（高） (temperature=42.1)', () => {
        const result = validateVitals({ temperature: 42.1 });
        expect(result.valid).toBe(false);
    });

    test('UT-VAL-007: 正常な体温入力 (temperature=36.5)', () => {
        const result = validateVitals({ temperature: 36.5 });
        expect(result.valid).toBe(true);
    });

    test('UT-VAL-008: SpO2範囲外 (spo2=101)', () => {
        const result = validateVitals({ spo2: 101 });
        expect(result.valid).toBe(false);
    });

    test('UT-VAL-009: null入力 - 任意項目 (pulse=null)', () => {
        const result = validateVitals({ pulse: null });
        expect(result.valid).toBe(true);
    });
});

describe('validatePatient - 患者情報バリデーション', () => {
    test('UT-VAL-010: 患者名が空', () => {
        const result = validatePatient({ name: '' });
        expect(result.valid).toBe(false);
    });

    test('UT-VAL-011: 生年月日が未来 (2099-01-01)', () => {
        const result = validatePatient({ name: '田中太郎', birthDate: '2099-01-01', gender: 'male' });
        expect(result.valid).toBe(false);
    });
});

describe('validateImportData - インポートデータバリデーション', () => {
    test('UT-VAL-012: 正常なインポートデータ', () => {
        const result = validateImportData({
            appName: 'emr',
            patients: [],
            records: [],
            prescriptions: [],
            labResults: []
        });
        expect(result.valid).toBe(true);
    });

    test('UT-VAL-013: appNameが不一致 (sbpr)', () => {
        const result = validateImportData({
            appName: 'sbpr',
            patients: [],
            records: [],
            prescriptions: [],
            labResults: []
        });
        expect(result.valid).toBe(false);
    });
});

// ============================================================
// 1.8 検査値判定
// ============================================================
describe('judgeLabValue - 検査値判定', () => {
    test('UT-LAB-001: 正常範囲内 ("5800", "3500", "9700") → "normal"', () => {
        expect(judgeLabValue('5800', '3500', '9700')).toBe('normal');
    });

    test('UT-LAB-002: 基準値下限未満 ("3000", "3500", "9700") → "abnormal"', () => {
        expect(judgeLabValue('3000', '3500', '9700')).toBe('abnormal');
    });

    test('UT-LAB-003: 基準値上限超過 ("10000", "3500", "9700") → "abnormal"', () => {
        expect(judgeLabValue('10000', '3500', '9700')).toBe('abnormal');
    });

    test('UT-LAB-004: 文字列検査値 ("陽性", null, null) → null', () => {
        expect(judgeLabValue('陽性', null, null)).toBeNull();
    });

    test('UT-LAB-005: 基準値なし ("5.0", null, null) → null', () => {
        expect(judgeLabValue('5.0', null, null)).toBeNull();
    });
});

// ============================================================
// 1.9 提案質問パース
// ============================================================
describe('parseSuggestions - 提案質問パース', () => {
    test('UT-SUG-001: 提案あり（改行区切り）', () => {
        const result = parseSuggestions('本文\n{{SUGGEST:質問1}}\n{{SUGGEST:質問2}}');
        expect(result.mainContent).toBe('本文');
        expect(result.suggestions).toEqual(['質問1', '質問2']);
    });

    test('UT-SUG-002: 提案なし', () => {
        const result = parseSuggestions('本文のみ');
        expect(result.mainContent).toBe('本文のみ');
        expect(result.suggestions).toEqual([]);
    });

    test('UT-SUG-003: 提案3件（連続）', () => {
        const result = parseSuggestions('本文{{SUGGEST:Q1}}{{SUGGEST:Q2}}{{SUGGEST:Q3}}');
        expect(result.mainContent).toBe('本文');
        expect(result.suggestions).toEqual(['Q1', 'Q2', 'Q3']);
        expect(result.suggestions).toHaveLength(3);
    });
});

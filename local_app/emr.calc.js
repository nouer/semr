/**
 * emr.calc.js - 電子カルテ計算・ユーティリティロジック（純粋関数）
 * ブラウザ依存なし（DOM操作禁止、IndexedDB禁止）
 */

// ============================================================
// 分類関数
// ============================================================

/**
 * 血圧分類（家庭血圧基準: JSH2019準拠）
 * @param {number} systolic - 収縮期血圧 (mmHg)
 * @param {number} diastolic - 拡張期血圧 (mmHg)
 * @returns {string} 血圧分類名
 */
function classifyBP(systolic, diastolic) {
    if (systolic >= 160 || diastolic >= 100) return 'III度高血圧';
    if (systolic >= 145 || diastolic >= 90) return 'II度高血圧';
    if (systolic >= 135 || diastolic >= 85) return 'I度高血圧';
    if (systolic >= 125 || diastolic >= 75) return '高値血圧';
    if (systolic >= 115) return '正常高値血圧';
    return '正常血圧';
}

/**
 * 血圧分類に対応するCSSクラス名を返す
 * @param {string} classification - classifyBP の戻り値
 * @returns {string} CSSクラス名
 */
function classifyBPClass(classification) {
    const map = {
        '正常血圧': 'bp-normal',
        '正常高値血圧': 'bp-elevated',
        '高値血圧': 'bp-high-normal',
        'I度高血圧': 'bp-grade1',
        'II度高血圧': 'bp-grade2',
        'III度高血圧': 'bp-grade3'
    };
    return map[classification] || 'bp-normal';
}

/**
 * BMI計算＋日本肥満学会基準分類
 * @param {number|null} weight - 体重 (kg)
 * @param {number|null} height - 身長 (cm)
 * @returns {object|null} { bmi, classification } or null
 */
function classifyBMI(weight, height) {
    if (weight == null || height == null) return null;
    const heightM = height / 100;
    const bmi = weight / (heightM * heightM);
    const bmiRounded = Math.round(bmi * 10) / 10;
    let classification;
    if (bmi < 18.5) {
        classification = '低体重（やせ）';
    } else if (bmi < 25.0) {
        classification = '普通体重';
    } else if (bmi < 30.0) {
        classification = '肥満（1度）';
    } else if (bmi < 35.0) {
        classification = '肥満（2度）';
    } else if (bmi < 40.0) {
        classification = '肥満（3度）';
    } else {
        classification = '肥満（4度）';
    }
    return { bmi: bmiRounded, classification };
}

/**
 * SpO2分類
 * @param {number|null} spo2 - SpO2値 (%)
 * @returns {object|null} { label, level } or null
 */
function classifySpo2(spo2) {
    if (spo2 == null) return null;
    if (spo2 >= 96) return { label: '正常', level: 'normal' };
    if (spo2 >= 91) return { label: '軽度低下', level: 'caution' };
    if (spo2 >= 86) return { label: '中等度低下', level: 'warning' };
    return { label: '重度低下', level: 'danger' };
}

// ============================================================
// 年齢計算
// ============================================================

/**
 * 生年月日から現在の年齢を計算
 * @param {string} birthDate - "YYYY-MM-DD"形式の生年月日
 * @returns {number} 年齢（整数）
 */
function calcAge(birthDate) {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age -= 1;
    }
    return age;
}

// ============================================================
// バリデーション関数
// ============================================================

/**
 * 患者情報バリデーション
 * @param {object} patient - 患者情報
 * @returns {object} { valid, errors[] }
 */
function validatePatient(patient) {
    const errors = [];

    // name: 必須、1-100文字
    if (!patient.name || typeof patient.name !== 'string' || patient.name.trim().length === 0) {
        errors.push('氏名を入力してください');
    } else if (patient.name.length > 100) {
        errors.push('氏名は100文字以内で入力してください');
    }

    // birthDate: 必須、過去日付、0-150歳
    if (!patient.birthDate) {
        errors.push('生年月日を入力してください');
    } else {
        const birth = new Date(patient.birthDate);
        const today = new Date();
        if (isNaN(birth.getTime())) {
            errors.push('生年月日の形式が不正です');
        } else {
            // 日付部分のみで比較（時刻の影響を排除）
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            if (patient.birthDate > todayStr) {
                errors.push('生年月日は過去の日付を入力してください');
            } else {
                const age = calcAge(patient.birthDate);
                if (age < 0 || age > 150) {
                    errors.push('生年月日が有効範囲外です（0〜150歳）');
                }
            }
        }
    }

    // gender: 必須、"male"/"female"/"other"
    if (!patient.gender) {
        errors.push('性別を選択してください');
    } else if (!['male', 'female', 'other'].includes(patient.gender)) {
        errors.push('性別の値が不正です');
    }

    // nameKana: 任意、ひらがな+長音記号+スペースのみ
    if (patient.nameKana != null && patient.nameKana !== '') {
        if (!/^[\u3040-\u309F\u30FC\u3000\s]+$/.test(patient.nameKana)) {
            errors.push('ふりがなはひらがなで入力してください');
        } else if (patient.nameKana.length > 100) {
            errors.push('ふりがなは100文字以内で入力してください');
        }
    }

    // phone: 任意、半角数字+ハイフン
    if (patient.phone != null && patient.phone !== '') {
        if (!/^[\d-]+$/.test(patient.phone)) {
            errors.push('電話番号は半角数字とハイフンで入力してください');
        } else if (patient.phone.length < 7 || patient.phone.length > 15) {
            errors.push('電話番号は7〜15文字で入力してください');
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * バイタルサインバリデーション
 * @param {object} vitals - バイタルサイン
 * @returns {object} { valid, errors[] }
 */
function validateVitals(vitals) {
    const errors = [];

    // 体温: 34.0-42.0
    if (vitals.temperature != null && vitals.temperature !== '') {
        const t = Number(vitals.temperature);
        if (isNaN(t) || t < 34.0 || t > 42.0) {
            errors.push('体温は34.0〜42.0の範囲で入力してください');
        }
    }

    // 収縮期血圧: 50-300
    if (vitals.systolic != null && vitals.systolic !== '') {
        const sys = Number(vitals.systolic);
        if (isNaN(sys) || sys < 50 || sys > 300) {
            errors.push('収縮期血圧は50〜300の範囲で入力してください');
        }
    }

    // 拡張期血圧: 30-200
    if (vitals.diastolic != null && vitals.diastolic !== '') {
        const dia = Number(vitals.diastolic);
        if (isNaN(dia) || dia < 30 || dia > 200) {
            errors.push('拡張期血圧は30〜200の範囲で入力してください');
        }
    }

    // 収縮期 > 拡張期
    if (vitals.systolic != null && vitals.systolic !== '' &&
        vitals.diastolic != null && vitals.diastolic !== '') {
        const sys = Number(vitals.systolic);
        const dia = Number(vitals.diastolic);
        if (!isNaN(sys) && !isNaN(dia) && sys >= 50 && sys <= 300 && dia >= 30 && dia <= 200) {
            if (sys <= dia) {
                errors.push('収縮期血圧は拡張期血圧より大きい値を入力してください');
            }
        }
    }

    // 脈拍: 20-300
    if (vitals.pulse != null && vitals.pulse !== '') {
        const p = Number(vitals.pulse);
        if (isNaN(p) || p < 20 || p > 300) {
            errors.push('脈拍は20〜300の範囲で入力してください');
        }
    }

    // SpO2: 50-100
    if (vitals.spo2 != null && vitals.spo2 !== '') {
        const s = Number(vitals.spo2);
        if (isNaN(s) || s < 50 || s > 100) {
            errors.push('SpO2は50〜100の範囲で入力してください');
        }
    }

    // 呼吸数: 1-60
    if (vitals.respiratoryRate != null && vitals.respiratoryRate !== '') {
        const rr = Number(vitals.respiratoryRate);
        if (isNaN(rr) || rr < 1 || rr > 60) {
            errors.push('呼吸数は1〜60の範囲で入力してください');
        }
    }

    // 体重: 1.0-300.0
    if (vitals.weight != null && vitals.weight !== '') {
        const w = Number(vitals.weight);
        if (isNaN(w) || w < 1.0 || w > 300.0) {
            errors.push('体重は1.0〜300.0の範囲で入力してください');
        }
    }

    // 身長: 30-250
    if (vitals.height != null && vitals.height !== '') {
        const h = Number(vitals.height);
        if (isNaN(h) || h < 30 || h > 250) {
            errors.push('身長は30〜250の範囲で入力してください');
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * SOAP記録バリデーション
 * @param {object} soap - { subjective, objective, assessment, plan }
 * @returns {object} { valid, errors[] }
 */
function validateSOAP(soap) {
    const errors = [];
    const fields = ['subjective', 'objective', 'assessment', 'plan'];
    const labels = { subjective: 'S', objective: 'O', assessment: 'A', plan: 'P' };

    // いずれか1つ以上必須
    const hasAny = fields.some(f => soap[f] != null && soap[f] !== '' && soap[f].trim().length > 0);
    if (!hasAny) {
        errors.push('S/O/A/Pのいずれか1つ以上を入力してください');
    }

    // 各最大2000文字
    for (const f of fields) {
        if (soap[f] != null && soap[f].length > 2000) {
            errors.push(`${labels[f]}は2000文字以内で入力してください`);
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * 処方バリデーション
 * @param {object} prescription - 処方情報
 * @returns {object} { valid, errors[] }
 */
function validatePrescription(prescription) {
    const errors = [];

    // medicine: 必須、1-200文字
    if (!prescription.medicine || typeof prescription.medicine !== 'string' || prescription.medicine.trim().length === 0) {
        errors.push('薬剤名を入力してください');
    } else if (prescription.medicine.length > 200) {
        errors.push('薬剤名は200文字以内で入力してください');
    }

    // days: 任意、1-365整数
    if (prescription.days != null && prescription.days !== '') {
        const d = Number(prescription.days);
        if (!Number.isInteger(d) || d < 1 || d > 365) {
            errors.push('処方日数は1〜365の整数で入力してください');
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * 検査結果バリデーション
 * @param {object} labResult - 検査結果情報
 * @returns {object} { valid, errors[] }
 */
function validateLabResult(labResult) {
    const errors = [];

    // category: 必須、"blood"/"urine"/"image"/"other"
    if (!labResult.category) {
        errors.push('検査カテゴリを選択してください');
    } else if (!['blood', 'urine', 'image', 'other'].includes(labResult.category)) {
        errors.push('検査カテゴリの値が不正です');
    }

    // itemName: 必須、1-200文字
    if (!labResult.itemName || typeof labResult.itemName !== 'string' || labResult.itemName.trim().length === 0) {
        errors.push('検査項目名を入力してください');
    } else if (labResult.itemName.length > 200) {
        errors.push('検査項目名は200文字以内で入力してください');
    }

    // value: 必須、1-100文字
    if (!labResult.value || typeof labResult.value !== 'string' || labResult.value.trim().length === 0) {
        errors.push('検査値を入力してください');
    } else if (labResult.value.length > 100) {
        errors.push('検査値は100文字以内で入力してください');
    }

    return { valid: errors.length === 0, errors };
}

/**
 * インポートデータバリデーション
 * @param {object} data - インポートデータ
 * @returns {object} { valid, error? }
 */
function validateImportData(data) {
    if (typeof data !== 'object' || data === null) {
        return { valid: false, error: 'JSONオブジェクト形式ではありません' };
    }
    if (data.appName !== 'emr') {
        return { valid: false, error: 'このファイルはemr形式ではありません' };
    }
    if (!Array.isArray(data.patients)) {
        return { valid: false, error: 'patientsフィールドが不正です' };
    }
    if (!Array.isArray(data.records)) {
        return { valid: false, error: 'recordsフィールドが不正です' };
    }
    if (!Array.isArray(data.prescriptions)) {
        return { valid: false, error: 'prescriptionsフィールドが不正です' };
    }
    if (!Array.isArray(data.labResults)) {
        return { valid: false, error: 'labResultsフィールドが不正です' };
    }
    return { valid: true };
}

// ============================================================
// 統計関数
// ============================================================

/**
 * バイタルサイン統計計算
 * @param {Array} records - vitalsフィールドを持つrecordの配列
 * @returns {object} 各バイタル項目の { avg, min, max }
 */
function calcVitalStats(records) {
    const vitalKeys = ['temperature', 'systolic', 'diastolic', 'pulse', 'spo2', 'respiratoryRate', 'weight'];
    const result = {};

    for (const key of vitalKeys) {
        const values = records
            .map(r => r.vitals && r.vitals[key] != null ? r.vitals[key] : null)
            .filter(v => v != null && !isNaN(v));

        if (values.length === 0) {
            result[key] = { avg: null, min: null, max: null };
        } else {
            const sum = values.reduce((a, b) => a + b, 0);
            const avg = sum / values.length;
            result[key] = {
                avg: Math.round(avg * 10) / 10,
                min: Math.min(...values),
                max: Math.max(...values)
            };
        }
    }

    return result;
}

/**
 * バイタル平均値のショートカット
 * @param {Array} records - vitalsフィールドを持つrecordの配列
 * @returns {object} 各バイタル項目の avg 値
 */
function calcAverageVitals(records) {
    const stats = calcVitalStats(records);
    const result = {};
    for (const key of Object.keys(stats)) {
        result[key] = stats[key].avg;
    }
    return result;
}

/**
 * バイタル最大・最小値のショートカット
 * @param {Array} records - vitalsフィールドを持つrecordの配列
 * @returns {object} 各バイタル項目の { min, max }
 */
function calcMinMaxVitals(records) {
    const stats = calcVitalStats(records);
    const result = {};
    for (const key of Object.keys(stats)) {
        result[key] = { min: stats[key].min, max: stats[key].max };
    }
    return result;
}

// ============================================================
// 検査値判定
// ============================================================

/**
 * 検査値判定
 * @param {string} value - 検査値
 * @param {string|number|null} referenceMin - 基準値下限
 * @param {string|number|null} referenceMax - 基準値上限
 * @returns {string|null} "normal" / "caution" / "abnormal" / null
 */
function judgeLabValue(value, referenceMin, referenceMax) {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return null;
    if (referenceMin == null && referenceMax == null) return null;

    const rangeMin = referenceMin != null ? parseFloat(referenceMin) : null;
    const rangeMax = referenceMax != null ? parseFloat(referenceMax) : null;

    // 範囲外は異常
    if (rangeMin != null && numValue < rangeMin) return 'abnormal';
    if (rangeMax != null && numValue > rangeMax) return 'abnormal';

    // 基準値の10%以内に迫っている場合は要注意
    if (rangeMin != null) {
        const margin = rangeMax != null
            ? (rangeMax - rangeMin) * 0.1
            : Math.abs(rangeMin) * 0.1;
        if (numValue < rangeMin + margin) return 'caution';
    }
    if (rangeMax != null) {
        const margin = rangeMin != null
            ? (rangeMax - rangeMin) * 0.1
            : Math.abs(rangeMax) * 0.1;
        if (numValue > rangeMax - margin) return 'caution';
    }

    return 'normal';
}

// ============================================================
// ユーティリティ
// ============================================================

/**
 * UUID v4 生成
 * @returns {string}
 */
function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * 患者コード自動生成
 * @param {string[]} existingCodes - 既存患者コードの配列
 * @returns {string} 次の患者コード（"P"+4桁ゼロ埋め）
 */
function generatePatientCode(existingCodes) {
    if (!existingCodes || existingCodes.length === 0) return 'P0001';
    const numbers = existingCodes
        .filter(code => /^P\d{4}$/.test(code))
        .map(code => parseInt(code.substring(1), 10));
    if (numbers.length === 0) return 'P0001';
    const maxNum = Math.max(...numbers);
    const nextNum = maxNum + 1;
    if (nextNum > 9999) throw new Error('患者コードが上限に達しました');
    return 'P' + String(nextNum).padStart(4, '0');
}

/**
 * 日時を "YYYY/MM/DD HH:MM" 形式にフォーマット
 * @param {string|Date} dateStr - 日時文字列またはDateオブジェクト
 * @returns {string}
 */
function formatDateTime(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '---';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 日時を "YYYY-MM-DDTHH:MM" 形式にフォーマット（datetime-local input用）
 * @param {Date} date - Dateオブジェクト
 * @returns {string}
 */
function formatDateTimeLocal(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 日付を "YYYY/MM/DD" 形式にフォーマット
 * @param {string|Date} dateStr - 日付文字列またはDateオブジェクト
 * @returns {string}
 */
function formatDate(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '---';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

/**
 * {{SUGGEST:テキスト}} を抽出
 * @param {string} content - AIレスポンス全文
 * @returns {object} { mainContent, suggestions[] }
 */
function parseSuggestions(content) {
    const suggestions = [];
    const regex = /\{\{SUGGEST:(.*?)\}\}/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        suggestions.push(match[1]);
    }
    const mainContent = content.replace(/\{\{SUGGEST:.*?\}\}/g, '').trim();
    return { mainContent, suggestions };
}

/**
 * HTML特殊文字エスケープ
 * @param {string} str - エスケープ対象文字列
 * @returns {string} エスケープ済み文字列
 */
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============================================================
// Node.js 環境（テスト用）でのエクスポート
// ============================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        classifyBP, classifyBPClass, classifyBMI, classifySpo2,
        calcAge,
        validatePatient, validateVitals, validateSOAP, validatePrescription, validateLabResult, validateImportData,
        calcVitalStats, calcAverageVitals, calcMinMaxVitals,
        judgeLabValue,
        generateUUID, generatePatientCode,
        formatDateTime, formatDateTimeLocal, formatDate,
        parseSuggestions, escapeHtml
    };
}

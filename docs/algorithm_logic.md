# アルゴリズム・ロジック仕様

## 1. 血圧分類アルゴリズム

### 1.1 分類基準（家庭血圧基準: JSH2019準拠）

| 分類 | 収縮期血圧 (mmHg) | 拡張期血圧 (mmHg) |
|------|-------------------|-------------------|
| 正常血圧 | < 115 | かつ < 75 |
| 正常高値血圧 | 115〜124 | かつ < 75 |
| 高値血圧 | 125〜134 | または 75〜84 |
| I度高血圧 | 135〜144 | または 85〜89 |
| II度高血圧 | 145〜159 | または 90〜99 |
| III度高血圧 | ≥ 160 | または ≥ 100 |

※ 家庭血圧基準を採用（診察室血圧より5mmHg低い基準）

### 1.2 判定ロジック
```
function classifyBP(systolic, diastolic):
    if systolic >= 160 or diastolic >= 100: return "III度高血圧"
    if systolic >= 145 or diastolic >= 90:  return "II度高血圧"
    if systolic >= 135 or diastolic >= 85:  return "I度高血圧"
    if systolic >= 125 or diastolic >= 75:  return "高値血圧"
    if systolic >= 115:                      return "正常高値血圧"
    return "正常血圧"
```

## 2. BMI計算・分類アルゴリズム

### 2.1 BMI計算
* BMI = 体重(kg) ÷ 身長(m)²
* 身長はcm入力を m に変換: `height / 100`
* 小数点第1位で四捨五入

### 2.2 BMI分類基準（日本肥満学会基準）

| 分類 | BMI |
|------|-----|
| 低体重（やせ） | < 18.5 |
| 普通体重 | 18.5 ≤ BMI < 25.0 |
| 肥満（1度） | 25.0 ≤ BMI < 30.0 |
| 肥満（2度） | 30.0 ≤ BMI < 35.0 |
| 肥満（3度） | 35.0 ≤ BMI < 40.0 |
| 肥満（4度） | ≥ 40.0 |

### 2.3 判定ロジック
```
function classifyBMI(weight, height):
    if weight == null or height == null: return null
    bmi = weight / (height / 100) ** 2
    if bmi < 18.5: return "低体重（やせ）"
    if bmi < 25.0: return "普通体重"
    if bmi < 30.0: return "肥満（1度）"
    if bmi < 35.0: return "肥満（2度）"
    if bmi < 40.0: return "肥満（3度）"
    return "肥満（4度）"
```

## 3. SpO2分類アルゴリズム

### 3.1 分類基準

| 分類 | SpO2 (%) | 対応 |
|------|----------|------|
| 正常 | ≥ 96 | 経過観察 |
| 軽度低下 | 91〜95 | 注意・要観察 |
| 中等度低下 | 86〜90 | 要対応 |
| 重度低下 | ≤ 85 | 緊急対応 |

### 3.2 判定ロジック
```
function classifySpo2(spo2):
    if spo2 == null: return null
    if spo2 >= 96: return { label: "正常", level: "normal" }
    if spo2 >= 91: return { label: "軽度低下", level: "caution" }
    if spo2 >= 86: return { label: "中等度低下", level: "warning" }
    return { label: "重度低下", level: "danger" }
```

## 4. 年齢計算アルゴリズム

### 4.1 仕様
* 生年月日から現在の年齢を計算（誕生日当日に加算）
* 引数: birthDate (string, "YYYY-MM-DD")
* 戻り値: 整数（歳）

### 4.2 判定ロジック
```
function calcAge(birthDate):
    today = new Date()
    birth = new Date(birthDate)
    age = today.getFullYear() - birth.getFullYear()
    // 誕生日前の場合は1引く
    m = today.getMonth() - birth.getMonth()
    if m < 0 or (m == 0 and today.getDate() < birth.getDate()):
        age -= 1
    return age
```

## 5. 患者コード自動生成アルゴリズム

### 5.1 仕様
* 既存の患者コードから次の番号を生成
* フォーマット: `P` + ゼロ埋め4桁
* 例: `P0001`, `P0002`, ..., `P9999`

### 5.2 判定ロジック
```
function generatePatientCode(existingCodes):
    if existingCodes is empty: return "P0001"
    // "P0001" → 1 のように数値部分を抽出
    numbers = existingCodes
        .filter(code => code matches /^P\d{4}$/)
        .map(code => parseInt(code.substring(1)))
    maxNum = Math.max(...numbers)
    nextNum = maxNum + 1
    if nextNum > 9999: throw Error("患者コードが上限に達しました")
    return "P" + String(nextNum).padStart(4, '0')
```

## 6. バイタルサイン統計計算アルゴリズム

### 6.1 平均値計算
* 算術平均を使用
* 体温・体重: 小数点第1位で四捨五入
* 血圧・脈拍・SpO2・呼吸数: 整数に四捨五入
* null値はスキップ（計算対象外）

### 6.2 最大・最小値計算
* 各バイタル項目のnull除外後の最大値・最小値を返す
* 全件がnullの場合はnullを返す

### 6.3 実装
```
function calcVitalStats(records):
    // recordsはvitalsフィールドを持つrecordの配列
    result = {}
    vitalKeys = ['temperature', 'systolic', 'diastolic', 'pulse', 'spo2', 'respiratoryRate', 'weight']
    for key in vitalKeys:
        values = records
            .map(r => r.vitals?.[key])
            .filter(v => v != null && !isNaN(v))
        if values.length == 0:
            result[key] = { avg: null, min: null, max: null }
        else:
            result[key] = {
                avg: round(sum(values) / values.length, key),
                min: Math.min(...values),
                max: Math.max(...values)
            }
    return result
```

## 7. 検査値判定アルゴリズム

### 7.1 仕様
* 検査値（数値の場合）と基準値範囲（referenceMin・referenceMax）を比較して判定
* 検査値が文字列の場合（陽性/陰性等）は判定しない（null返却）

### 7.2 判定ロジック
```
function judgeLabValue(value, referenceMin, referenceMax):
    numValue = parseFloat(value)
    if isNaN(numValue): return null
    if referenceMin == null and referenceMax == null: return null
    if referenceMin != null and numValue < parseFloat(referenceMin): return "abnormal"
    if referenceMax != null and numValue > parseFloat(referenceMax): return "abnormal"
    // 基準値の10%以内に迫っている場合は要注意
    rangeMin = referenceMin != null ? parseFloat(referenceMin) : null
    rangeMax = referenceMax != null ? parseFloat(referenceMax) : null
    if rangeMin != null:
        margin = (rangeMax - rangeMin) * 0.1 if rangeMax != null else abs(rangeMin) * 0.1
        if numValue < rangeMin + margin: return "caution"
    if rangeMax != null:
        margin = (rangeMax - rangeMin) * 0.1 if rangeMin != null else abs(rangeMax) * 0.1
        if numValue > rangeMax - margin: return "caution"
    return "normal"
```

## 8. エクスポートデータバリデーションアルゴリズム

### 8.1 仕様
* インポート時に読み込んだJSONが正しいemr形式かチェック

### 8.2 判定ロジック
```
function validateImportData(data):
    if typeof data != 'object': return { valid: false, error: "JSONオブジェクト形式ではありません" }
    if data.appName != 'emr': return { valid: false, error: "このファイルはemr形式ではありません" }
    if !Array.isArray(data.patients): return { valid: false, error: "patientsフィールドが不正です" }
    if !Array.isArray(data.records): return { valid: false, error: "recordsフィールドが不正です" }
    if !Array.isArray(data.prescriptions): return { valid: false, error: "prescriptionsフィールドが不正です" }
    if !Array.isArray(data.labResults): return { valid: false, error: "labResultsフィールドが不正です" }
    return { valid: true }
```

## 9. UUID生成
* `crypto.randomUUID()` を使用（対応ブラウザ）
* フォールバック: Math.random() ベースのUUID v4生成

```
function generateUUID():
    if crypto.randomUUID is available:
        return crypto.randomUUID()
    // フォールバック
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c):
        r = Math.random() * 16 | 0
        v = c == 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
    )
```

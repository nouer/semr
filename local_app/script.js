/**
 * script.js - 電子カルテ (emr) メインロジック
 */
const DB_NAME = 'emr_db';
const DB_VERSION = 3;
const MEDIA_MAX_PER_RECORD = 5;
const MEDIA_MAX_LONG_SIDE = 1200;
const MEDIA_JPEG_QUALITY = 0.8;
const MEDIA_THUMB_SIZE = 200;
const MEDIA_THUMB_QUALITY = 0.6;

// ===== IndexedDB 操作 =====

/**
 * IndexedDBを開く
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // patients ストア
            if (!db.objectStoreNames.contains('patients')) {
                const pStore = db.createObjectStore('patients', { keyPath: 'id' });
                pStore.createIndex('name', 'name', { unique: false });
                pStore.createIndex('nameKana', 'nameKana', { unique: false });
                pStore.createIndex('patientCode', 'patientCode', { unique: false });
            }

            // records ストア
            if (!db.objectStoreNames.contains('records')) {
                const rStore = db.createObjectStore('records', { keyPath: 'id' });
                rStore.createIndex('patientId', 'patientId', { unique: false });
                rStore.createIndex('visitedAt', 'visitedAt', { unique: false });
            }

            // prescriptions ストア
            if (!db.objectStoreNames.contains('prescriptions')) {
                const rxStore = db.createObjectStore('prescriptions', { keyPath: 'id' });
                rxStore.createIndex('patientId', 'patientId', { unique: false });
                rxStore.createIndex('recordId', 'recordId', { unique: false });
                rxStore.createIndex('prescribedAt', 'prescribedAt', { unique: false });
            }

            // lab_results ストア
            if (!db.objectStoreNames.contains('lab_results')) {
                const labStore = db.createObjectStore('lab_results', { keyPath: 'id' });
                labStore.createIndex('patientId', 'patientId', { unique: false });
                labStore.createIndex('examinedAt', 'examinedAt', { unique: false });
                labStore.createIndex('category', 'category', { unique: false });
            }

            // ai_conversations ストア
            if (!db.objectStoreNames.contains('ai_conversations')) {
                const aiStore = db.createObjectStore('ai_conversations', { keyPath: 'id' });
                aiStore.createIndex('patientId', 'patientId', { unique: false });
            }

            // media ストア (v2)
            if (!db.objectStoreNames.contains('media')) {
                const mediaStore = db.createObjectStore('media', { keyPath: 'id' });
                mediaStore.createIndex('parentId', 'parentId', { unique: false });
                mediaStore.createIndex('parentType', 'parentType', { unique: false });
            }

            // app_settings ストア (v3)
            if (!db.objectStoreNames.contains('app_settings')) {
                db.createObjectStore('app_settings', { keyPath: 'id' });
            }
        };
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

/**
 * ストアにレコードを追加
 * @param {string} storeName
 * @param {object} record
 * @returns {Promise<string>} id
 */
async function addToStore(storeName, record) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.add(record);
        request.onsuccess = () => resolve(record.id);
        request.onerror = (event) => reject(event.target.error);
    });
}

/**
 * ストアのレコードを更新
 * @param {string} storeName
 * @param {object} record
 * @returns {Promise<void>}
 */
async function updateInStore(storeName, record) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.put(record);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

/**
 * ストアからレコードを1件取得
 * @param {string} storeName
 * @param {string} id
 * @returns {Promise<object>}
 */
async function getFromStore(storeName, id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.get(id);
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

/**
 * ストアから全レコード取得
 * @param {string} storeName
 * @returns {Promise<Array>}
 */
async function getAllFromStore(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

/**
 * ストアからレコードを削除
 * @param {string} storeName
 * @param {string} id
 * @returns {Promise<void>}
 */
async function deleteFromStore(storeName, id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

/**
 * ストアの全レコードを削除
 * @param {string} storeName
 * @returns {Promise<void>}
 */
async function clearStore(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

/**
 * インデックスで検索して配列を返す
 * @param {string} storeName
 * @param {string} indexName
 * @param {*} value
 * @returns {Promise<Array>}
 */
async function getByIndex(storeName, indexName, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const index = store.index(indexName);
        const request = index.getAll(value);
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

// ===== ストア名定数 =====

const PATIENTS_STORE = 'patients';
const RECORDS_STORE = 'records';
const PRESCRIPTIONS_STORE = 'prescriptions';
const LAB_RESULTS_STORE = 'lab_results';
const MEDIA_STORE = 'media';
const APP_SETTINGS_STORE = 'app_settings';

// ===== 表示設定 =====

function getDefaultDisplaySettings() {
    return {
        id: 'display_settings',
        tabs: { prescription: true, lab: true },
        fields: {
            patient: { code: true, kana: true, phone: true, email: true, insurance: true, address: true, emergency: true, firstVisit: true, doctor: true, memo: true, allergies: true, histories: true, photo: true },
            karte: { temperature: true, systolic: true, diastolic: true, pulse: true, spo2: true, respiratoryRate: true, weight: true, height: true, treatmentMemo: true, kartePhoto: true },
            prescription: { prescriptionDate: true, dosage: true, frequency: true, days: true, prescriptionMemo: true },
            lab: { examinedAt: true, unit: true, refMin: true, refMax: true, labMemo: true }
        }
    };
}

async function loadDisplaySettings() {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(APP_SETTINGS_STORE, 'readonly');
            const store = tx.objectStore(APP_SETTINGS_STORE);
            const request = store.get('display_settings');
            request.onsuccess = () => resolve(request.result || getDefaultDisplaySettings());
            request.onerror = () => resolve(getDefaultDisplaySettings());
        });
    } catch (e) {
        return getDefaultDisplaySettings();
    }
}

async function saveDisplaySettings(settings) {
    settings.id = 'display_settings';
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(APP_SETTINGS_STORE, 'readwrite');
        tx.objectStore(APP_SETTINGS_STORE).put(settings);
        tx.oncomplete = () => resolve();
        tx.onerror = (event) => reject(event.target.error);
    });
}

// ===== ドメインヘルパー関数 =====

async function getAllPatients() {
    return getAllFromStore('patients');
}

async function addPatient(patient) {
    return addToStore('patients', patient);
}

async function getRecord(id) {
    return getFromStore('records', id);
}

async function addRecord(record) {
    return addToStore('records', record);
}

async function addPrescription(prescription) {
    return addToStore('prescriptions', prescription);
}

async function addLabResult(labResult) {
    return addToStore('lab_results', labResult);
}

async function getRecordsByPatient(patientId) {
    return getByIndex('records', 'patientId', patientId);
}

async function getPrescriptionsByPatient(patientId) {
    return getByIndex('prescriptions', 'patientId', patientId);
}

async function getLabResultsByPatient(patientId) {
    return getByIndex('lab_results', 'patientId', patientId);
}

// ===== メディア関連関数 =====

/**
 * 画像をリサイズしてdataURLを返す
 * @param {File} file
 * @param {number} maxSide - 長辺の最大ピクセル数
 * @param {number} quality - JPEG品質 (0-1)
 * @returns {Promise<string>} data URL
 */
function resizeImage(file, maxSide, quality) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            let { width, height } = img;
            if (width > maxSide || height > maxSide) {
                if (width > height) {
                    height = Math.round(height * maxSide / width);
                    width = maxSide;
                } else {
                    width = Math.round(width * maxSide / height);
                    height = maxSide;
                }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('画像の読み込みに失敗しました'));
        };
        img.src = url;
    });
}

/**
 * ファイルからメディアレコードを作成
 * @param {File} file
 * @param {string} parentId
 * @param {string} parentType - "record" | "patient" | "lab_result"
 * @returns {Promise<object>} media record
 */
async function createMediaRecord(file, parentId, parentType) {
    const dataUrl = await resizeImage(file, MEDIA_MAX_LONG_SIDE, MEDIA_JPEG_QUALITY);
    const thumbnail = await resizeImage(file, MEDIA_THUMB_SIZE, MEDIA_THUMB_QUALITY);
    return {
        id: generateUUID(),
        parentId,
        parentType,
        fileName: file.name,
        mimeType: 'image/jpeg',
        dataUrl,
        thumbnail,
        memo: '',
        createdAt: new Date().toISOString()
    };
}

/**
 * メディアを保存
 */
async function saveMedia(mediaRecord) {
    return addToStore('media', mediaRecord);
}

/**
 * 親IDに紐付くメディアを取得
 */
async function getMediaByParent(parentId) {
    return getByIndex('media', 'parentId', parentId);
}

/**
 * メディアを削除
 */
async function deleteMedia(mediaId) {
    return deleteFromStore('media', mediaId);
}

/**
 * 親IDに紐付く全メディアを削除
 */
async function deleteMediaByParent(parentId) {
    const items = await getMediaByParent(parentId);
    for (const item of items) {
        await deleteFromStore('media', item.id);
    }
}

// ===== メディアUI: ステージング管理 =====

// ステージングされた添付ファイル（保存前の一時バッファ）
let mediaStagingBuffers = {
    record: [],
    patient: [],
    lab_result: []
};

/**
 * メディアステージングをリセット
 */
function clearMediaStaging(parentType) {
    mediaStagingBuffers[parentType] = [];
}

/**
 * ファイルをステージングに追加
 */
async function stageMediaFiles(files, parentType, containerEl) {
    const current = mediaStagingBuffers[parentType];
    for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        if (current.length >= MEDIA_MAX_PER_RECORD) {
            showMessage(containerEl.dataset.messageId || 'record-message',
                `写真は最大${MEDIA_MAX_PER_RECORD}枚までです`, 'error');
            break;
        }
        try {
            const dataUrl = await resizeImage(file, MEDIA_MAX_LONG_SIDE, MEDIA_JPEG_QUALITY);
            const thumbnail = await resizeImage(file, MEDIA_THUMB_SIZE, MEDIA_THUMB_QUALITY);
            current.push({
                id: generateUUID(),
                fileName: file.name,
                mimeType: 'image/jpeg',
                dataUrl,
                thumbnail,
                memo: '',
                createdAt: new Date().toISOString()
            });
        } catch (e) {
            // 画像読み込み失敗は無視
        }
    }
    renderMediaStaging(parentType, containerEl);
}

/**
 * ステージングされたメディアのサムネイルを描画
 */
function renderMediaStaging(parentType, containerEl) {
    const items = mediaStagingBuffers[parentType];
    const grid = containerEl.querySelector('.media-thumb-grid');
    if (!grid) return;

    // 既存保存済み分を保持（data-saved属性付き）
    const savedThumbs = grid.querySelectorAll('.media-thumb-item[data-saved]');
    grid.innerHTML = '';
    savedThumbs.forEach(el => grid.appendChild(el));

    items.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'media-thumb-item';
        div.innerHTML = `<img src="${item.thumbnail}" alt="${escapeHtml(item.fileName)}" onclick="openMediaLightbox('${item.id}', 'staging', '${parentType}')">
            <button type="button" class="media-thumb-remove" onclick="removeStagedMedia('${parentType}', ${idx}, this)">&times;</button>`;
        grid.appendChild(div);
    });
}

/**
 * ステージングからメディアを削除
 */
function removeStagedMedia(parentType, index, btnEl) {
    mediaStagingBuffers[parentType].splice(index, 1);
    const container = btnEl.closest('.media-attach-area');
    if (container) renderMediaStaging(parentType, container);
}

/**
 * 保存済みメディアのサムネイルを描画
 */
function renderSavedMedia(mediaItems, containerEl) {
    const grid = containerEl.querySelector('.media-thumb-grid');
    if (!grid) return;
    grid.innerHTML = '';
    mediaItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'media-thumb-item';
        div.dataset.saved = 'true';
        div.dataset.mediaId = item.id;
        div.innerHTML = `<img src="${item.thumbnail}" alt="${escapeHtml(item.fileName)}" onclick="openMediaLightbox('${item.id}', 'saved')">
            <button type="button" class="media-thumb-remove" onclick="deleteSavedMedia('${item.id}', this)">&times;</button>`;
        grid.appendChild(div);
    });
}

/**
 * 保存済みメディアを削除
 */
async function deleteSavedMedia(mediaId, btnEl) {
    await deleteMedia(mediaId);
    const thumbItem = btnEl.closest('.media-thumb-item');
    if (thumbItem) thumbItem.remove();
}

/**
 * ステージングバッファの内容をIndexedDBに保存
 */
async function commitStagedMedia(parentId, parentType) {
    const items = mediaStagingBuffers[parentType];
    for (const item of items) {
        await saveMedia({
            ...item,
            parentId,
            parentType
        });
    }
    clearMediaStaging(parentType);
}

/**
 * ライトボックスで画像を表示
 */
function openMediaLightbox(mediaId, source, parentType) {
    let dataUrl = null;
    if (source === 'staging' && parentType) {
        const item = mediaStagingBuffers[parentType].find(m => m.id === mediaId);
        if (item) dataUrl = item.dataUrl;
    }
    if (dataUrl) {
        showLightbox(dataUrl);
    } else {
        // IndexedDBから取得
        getFromStore('media', mediaId).then(item => {
            if (item) showLightbox(item.dataUrl);
        });
    }
}

function showLightbox(dataUrl) {
    const overlay = document.getElementById('media-lightbox-overlay');
    const img = document.getElementById('media-lightbox-img');
    if (!overlay || !img) return;
    img.src = dataUrl;
    overlay.classList.add('show');
}

function closeLightbox() {
    const overlay = document.getElementById('media-lightbox-overlay');
    if (overlay) {
        overlay.classList.remove('show');
        document.getElementById('media-lightbox-img').src = '';
    }
}

/**
 * メディア添付エリアのイベントを初期化
 */
function initMediaAttachArea(containerEl, parentType) {
    const fileInput = containerEl.querySelector('.media-file-input');
    const dropZone = containerEl.querySelector('.media-drop-zone');
    if (!fileInput || !dropZone) return;

    fileInput.addEventListener('change', async () => {
        if (fileInput.files.length > 0) {
            await stageMediaFiles(Array.from(fileInput.files), parentType, containerEl);
            fileInput.value = '';
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        if (files.length > 0) {
            await stageMediaFiles(files, parentType, containerEl);
        }
    });
}

async function renderPatientList() {
    await loadPatients();
}

// ===== アプリケーション状態 =====

let selectedPatientId = null;
let selectedPatient = null;
let currentLabFilter = 'all';
let historySortDesc = true;
let historyPage = 1;
const HISTORY_PAGE_SIZE = 20;
let vitalsChart = null;
let labChart = null;
let currentVitalsPeriod = 30;

const GENDER_MAP = { male: '男性', female: '女性', other: 'その他' };

// ===== UI ユーティリティ =====

/**
 * メッセージ表示
 * @param {string} elementId
 * @param {string} text
 * @param {string} type - 'success' | 'error' | 'info'
 */
function showMessage(elementId, text, type) {
    const el = document.getElementById(elementId);
    el.textContent = text;
    el.className = `message show ${type}`;
    setTimeout(() => {
        el.classList.remove('show');
    }, 3000);
}

/**
 * 確認ダイアログ（Promise）
 * @param {string} title
 * @param {string} message
 * @param {string} okText
 * @param {string} okClass
 * @returns {Promise<boolean>}
 */
function showConfirm(title, message, okText = '実行', okClass = 'btn-danger') {
    return new Promise((resolve) => {
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        document.getElementById('confirm-ok').textContent = okText;
        document.getElementById('confirm-ok').className = `btn ${okClass}`;
        document.getElementById('confirm-overlay').classList.add('show');
        document.getElementById('confirm-ok').onclick = () => {
            document.getElementById('confirm-overlay').classList.remove('show');
            resolve(true);
        };
        document.getElementById('confirm-cancel').onclick = () => {
            document.getElementById('confirm-overlay').classList.remove('show');
            resolve(false);
        };
    });
}

// ===== 患者管理 =====

/**
 * 患者一覧を読み込んで表示
 */
async function loadPatients() {
    const patients = await getAllFromStore('patients');
    patients.sort((a, b) => (a.patientCode || '').localeCompare(b.patientCode || ''));
    const container = document.getElementById('patient-list');

    if (patients.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>患者が登録されていません</p></div>';
        return;
    }

    container.innerHTML = patients.map(p => renderPatientCard(p)).join('');
}

/**
 * 患者カードのHTML生成
 * @param {object} patient
 * @returns {string}
 */
function renderPatientCard(patient) {
    const age = patient.birthDate ? calcAge(patient.birthDate) : '---';
    const gender = GENDER_MAP[patient.gender] || '';
    const allergyBadge = (patient.allergies && patient.allergies.length > 0)
        ? '<span class="badge badge-danger">アレルギー有</span>'
        : '';
    const isSelected = selectedPatientId === patient.id ? ' selected' : '';

    return `<div class="patient-card${isSelected}" data-patient-id="${patient.id}" onclick="selectPatient('${patient.id}')">
        <div class="patient-card-header">
            <span class="patient-code">${escapeHtml(patient.patientCode || '---')}</span>
            ${allergyBadge}
        </div>
        <div class="patient-card-body">
            <span class="patient-name">${escapeHtml(patient.name)}</span>
            <span class="patient-meta">${age}歳 / ${gender}</span>
        </div>
        <div class="patient-card-actions">
            <button class="btn btn-sm" onclick="event.stopPropagation(); openPatientForm('${patient.id}')">編集</button>
            <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deletePatient('${patient.id}')">削除</button>
        </div>
    </div>`;
}

/**
 * 患者を選択して各タブに反映
 * @param {string} patientId
 */
async function selectPatient(patientId) {
    const patient = await getFromStore('patients', patientId);
    if (!patient) return;

    selectedPatientId = patientId;
    selectedPatient = patient;

    updatePatientBars();
    showAllergyWarning();

    // カルテタブのコンテンツを表示
    document.getElementById('no-patient-selected').style.display = 'none';
    document.getElementById('karte-content').style.display = '';

    // 処方タブのコンテンツを表示
    document.getElementById('no-patient-prescription').style.display = 'none';
    document.getElementById('prescription-content').style.display = '';

    // 検査タブのコンテンツを表示
    document.getElementById('no-patient-lab').style.display = 'none';
    document.getElementById('lab-content').style.display = '';

    // 履歴タブのコンテンツを表示
    document.getElementById('no-patient-history').style.display = 'none';
    document.getElementById('history-content').style.display = '';

    // AI患者バーを表示
    const aiBar = document.getElementById('ai-patient-bar');
    if (aiBar) aiBar.style.display = '';

    // 患者一覧の選択状態を更新
    document.querySelectorAll('.patient-card').forEach(card => {
        card.classList.toggle('selected', card.dataset.patientId === patientId);
    });

    // フォームをリセット
    resetKarteForm();

    // AI会話をリセット
    aiConversation = [];
    const aiChatMessages = document.getElementById('ai-chat-messages');
    if (aiChatMessages) aiChatMessages.innerHTML = '';
    const aiChatContainer = document.getElementById('ai-chat-container');
    if (aiChatContainer) aiChatContainer.style.display = 'none';
    const aiFollowup = document.getElementById('ai-followup');
    if (aiFollowup) aiFollowup.style.display = 'none';

    // 各タブのデータをロード
    await loadRecentRecords();
    await loadPrescriptions();
    await loadLabResults();
    showPrevPlanHint();

    // カルテタブに切り替え
    const karteBtn = document.querySelector('#tab-nav button[data-tab="karte"]');
    if (karteBtn) karteBtn.click();
}

/**
 * 患者選択を解除
 */
function deselectPatient() {
    selectedPatientId = null;
    selectedPatient = null;

    // カルテタブ
    document.getElementById('no-patient-selected').style.display = '';
    document.getElementById('karte-content').style.display = 'none';

    // 処方タブ
    document.getElementById('no-patient-prescription').style.display = '';
    document.getElementById('prescription-content').style.display = 'none';

    // 検査タブ
    document.getElementById('no-patient-lab').style.display = '';
    document.getElementById('lab-content').style.display = 'none';

    // 履歴タブ
    document.getElementById('no-patient-history').style.display = '';
    document.getElementById('history-content').style.display = 'none';

    // AI患者バー
    const aiBar = document.getElementById('ai-patient-bar');
    if (aiBar) aiBar.style.display = 'none';

    // アレルギー警告を非表示
    document.getElementById('allergy-warning').style.display = 'none';

    // 患者一覧の選択状態をクリア
    document.querySelectorAll('.patient-card').forEach(card => {
        card.classList.remove('selected');
    });
}

/**
 * 全患者情報バーを更新
 */
function updatePatientBars() {
    if (!selectedPatient) return;

    const age = selectedPatient.birthDate ? calcAge(selectedPatient.birthDate) : '---';
    const gender = GENDER_MAP[selectedPatient.gender] || '';
    const barHtml = `<span class="patient-bar-code">${escapeHtml(selectedPatient.patientCode || '---')}</span>
        <span class="patient-bar-name">${escapeHtml(selectedPatient.name)}</span>
        <span class="patient-bar-meta">${age}歳 / ${gender}</span>`;

    const barIds = [
        'selected-patient-bar',
        'prescription-patient-bar',
        'lab-patient-bar',
        'history-patient-bar',
        'ai-patient-bar'
    ];

    barIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = barHtml;
    });
}

/**
 * アレルギー警告を表示
 */
function showAllergyWarning() {
    const warningEl = document.getElementById('allergy-warning');
    if (!selectedPatient || !selectedPatient.allergies || selectedPatient.allergies.length === 0) {
        warningEl.style.display = 'none';
        return;
    }

    const allergens = selectedPatient.allergies
        .map(a => escapeHtml(a.allergen || a))
        .join('、');
    warningEl.innerHTML = `<strong>⚠️ アレルギー:</strong> ${allergens}`;
    warningEl.style.display = '';
}

/**
 * 患者登録/編集フォームを開く
 * @param {string} [patientId] - 編集時の患者ID
 */
async function openPatientForm(patientId) {
    const overlay = document.getElementById('patient-form-overlay');
    const title = document.getElementById('patient-form-title');
    const form = document.getElementById('patient-form');

    // フォームリセット
    form.reset();
    document.getElementById('edit-patient-id').value = '';
    document.getElementById('allergy-list-form').innerHTML = '';
    document.getElementById('history-list-form').innerHTML = '';

    if (patientId) {
        // 編集モード
        const patient = await getFromStore('patients', patientId);
        if (!patient) return;

        title.textContent = '患者情報を編集';
        document.getElementById('edit-patient-id').value = patient.id;
        document.getElementById('input-patient-code').value = patient.patientCode || '';
        document.getElementById('input-patient-name').value = patient.name || '';
        document.getElementById('input-patient-kana').value = patient.nameKana || '';
        document.getElementById('input-patient-birth').value = patient.birthDate || '';
        document.getElementById('input-patient-gender').value = patient.gender || '';
        document.getElementById('input-patient-phone').value = patient.phone || '';
        document.getElementById('input-patient-email').value = patient.email || '';
        document.getElementById('input-patient-insurance').value = patient.insuranceNumber || '';
        document.getElementById('input-patient-address').value = patient.address || '';
        document.getElementById('input-emergency-name').value = (patient.emergencyContact && patient.emergencyContact.name) || '';
        document.getElementById('input-emergency-relationship').value = (patient.emergencyContact && patient.emergencyContact.relationship) || '';
        document.getElementById('input-emergency-phone').value = (patient.emergencyContact && patient.emergencyContact.phone) || '';
        document.getElementById('input-patient-first-visit').value = patient.firstVisitDate || '';
        document.getElementById('input-patient-practitioner').value = patient.practitioner || '';
        document.getElementById('input-patient-memo').value = patient.memo || '';

        // アレルギー行を復元
        if (patient.allergies && patient.allergies.length > 0) {
            patient.allergies.forEach(a => addAllergyRow(a));
        }

        // 既往歴行を復元
        if (patient.medicalHistory && patient.medicalHistory.length > 0) {
            patient.medicalHistory.forEach(h => addHistoryRow(h));
        }

        // メディア読み込み
        clearMediaStaging('patient');
        const patientMediaArea = document.getElementById('patient-media-area');
        if (patientMediaArea) {
            const patientMedia = await getMediaByParent(patient.id);
            renderSavedMedia(patientMedia, patientMediaArea);
        }
    } else {
        // 新規登録モード
        title.textContent = '新規患者登録';
        clearMediaStaging('patient');
        const patientMediaArea = document.getElementById('patient-media-area');
        if (patientMediaArea) {
            const grid = patientMediaArea.querySelector('.media-thumb-grid');
            if (grid) grid.innerHTML = '';
        }
    }

    overlay.classList.add('show');
}

/**
 * アレルギー行を追加
 * @param {object|string} [allergy] - 既存アレルギーデータ
 */
function addAllergyRow(allergy) {
    const container = document.getElementById('allergy-list-form');
    const row = document.createElement('div');
    row.className = 'dynamic-row allergy-row';

    const allergen = (typeof allergy === 'string') ? allergy : (allergy && allergy.allergen) || '';
    const severity = (typeof allergy === 'object' && allergy && allergy.severity) || '';
    const note = (typeof allergy === 'object' && allergy && allergy.note) || '';

    row.innerHTML = `<input type="text" class="allergy-allergen" placeholder="アレルゲン" value="${escapeHtml(allergen)}">
        <select class="allergy-severity">
            <option value="">重症度</option>
            <option value="mild"${severity === 'mild' ? ' selected' : ''}>軽度</option>
            <option value="moderate"${severity === 'moderate' ? ' selected' : ''}>中等度</option>
            <option value="severe"${severity === 'severe' ? ' selected' : ''}>重度</option>
        </select>
        <input type="text" class="allergy-note" placeholder="備考" value="${escapeHtml(note)}">
        <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button>`;
    container.appendChild(row);
}

/**
 * 既往歴行を追加
 * @param {object|string} [history] - 既存既往歴データ
 */
function addHistoryRow(history) {
    const container = document.getElementById('history-list-form');
    const row = document.createElement('div');
    row.className = 'dynamic-row history-row';

    const disease = (typeof history === 'string') ? history : (history && history.disease) || '';
    const diagnosedAt = (typeof history === 'object' && history && history.diagnosedAt) || '';
    const note = (typeof history === 'object' && history && history.note) || '';

    row.innerHTML = `<input type="text" class="history-disease" placeholder="疾患名" value="${escapeHtml(disease)}">
        <input type="text" class="history-diagnosed-at" placeholder="診断時期" value="${escapeHtml(diagnosedAt)}">
        <input type="text" class="history-note" placeholder="備考" value="${escapeHtml(note)}">
        <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button>`;
    container.appendChild(row);
}

/**
 * フォームからアレルギー情報を収集
 * @returns {Array}
 */
function collectAllergies() {
    const rows = document.querySelectorAll('#allergy-list-form .allergy-row');
    const allergies = [];
    rows.forEach(row => {
        const allergen = row.querySelector('.allergy-allergen').value.trim();
        if (!allergen) return;
        allergies.push({
            allergen: allergen,
            severity: row.querySelector('.allergy-severity').value || null,
            note: row.querySelector('.allergy-note').value.trim() || null
        });
    });
    return allergies;
}

/**
 * フォームから既往歴情報を収集
 * @returns {Array}
 */
function collectMedicalHistory() {
    const rows = document.querySelectorAll('#history-list-form .history-row');
    const histories = [];
    rows.forEach(row => {
        const disease = row.querySelector('.history-disease').value.trim();
        if (!disease) return;
        histories.push({
            disease: disease,
            diagnosedAt: row.querySelector('.history-diagnosed-at').value.trim() || null,
            note: row.querySelector('.history-note').value.trim() || null
        });
    });
    return histories;
}

/**
 * 患者を保存（新規/編集）
 * @param {Event} event
 */
async function savePatient(event) {
    event.preventDefault();

    const editId = document.getElementById('edit-patient-id').value;
    const name = document.getElementById('input-patient-name').value.trim();
    const nameKana = document.getElementById('input-patient-kana').value.trim() || null;
    const birthDate = document.getElementById('input-patient-birth').value || null;
    const gender = document.getElementById('input-patient-gender').value || null;
    const phone = document.getElementById('input-patient-phone').value.trim() || null;
    const email = document.getElementById('input-patient-email').value.trim() || null;
    const insuranceNumber = document.getElementById('input-patient-insurance').value.trim() || null;
    const address = document.getElementById('input-patient-address').value.trim() || null;
    const emergencyName = document.getElementById('input-emergency-name').value.trim() || null;
    const emergencyRelationship = document.getElementById('input-emergency-relationship').value.trim() || null;
    const emergencyPhone = document.getElementById('input-emergency-phone').value.trim() || null;
    const firstVisitDate = document.getElementById('input-patient-first-visit').value || null;
    const practitioner = document.getElementById('input-patient-practitioner').value.trim() || null;
    const memo = document.getElementById('input-patient-memo').value.trim() || null;
    let patientCode = document.getElementById('input-patient-code').value.trim() || null;

    const allergies = collectAllergies();
    const medicalHistory = collectMedicalHistory();

    // バリデーション
    const validation = validatePatient({ name, nameKana, birthDate, gender, phone });
    if (!validation.valid) {
        showMessage('patient-form-message', validation.errors[0], 'error');
        return;
    }

    const emergencyContact = (emergencyName || emergencyRelationship || emergencyPhone)
        ? { name: emergencyName, relationship: emergencyRelationship, phone: emergencyPhone }
        : null;

    const now = new Date().toISOString();

    try {
        if (editId) {
            // 編集
            const existing = await getFromStore('patients', editId);
            if (!existing) return;

            const updated = {
                ...existing,
                name,
                nameKana,
                birthDate,
                gender,
                phone,
                email,
                insuranceNumber,
                address,
                emergencyContact,
                firstVisitDate,
                practitioner,
                memo,
                patientCode: patientCode || existing.patientCode,
                allergies,
                medicalHistory,
                updatedAt: now
            };

            await updateInStore('patients', updated);
            await commitStagedMedia(editId, 'patient');
            showMessage('patient-form-message', '患者情報を更新しました', 'success');
        } else {
            // 新規登録 - 患者コード自動生成
            if (!patientCode) {
                const allPatients = await getAllFromStore('patients');
                const existingCodes = allPatients.map(p => p.patientCode).filter(Boolean);
                patientCode = generatePatientCode(existingCodes);
            }

            const newPatient = {
                id: generateUUID(),
                patientCode,
                name,
                nameKana,
                birthDate,
                gender,
                phone,
                email,
                insuranceNumber,
                address,
                emergencyContact,
                firstVisitDate,
                practitioner,
                memo,
                allergies,
                medicalHistory,
                createdAt: now,
                updatedAt: now
            };

            await addToStore('patients', newPatient);
            await commitStagedMedia(newPatient.id, 'patient');
            showMessage('patient-form-message', '患者を登録しました', 'success');
        }

        document.getElementById('patient-form-overlay').classList.remove('show');
        await loadPatients();

        // 編集した場合で選択中なら情報を更新
        if (editId && selectedPatientId === editId) {
            selectedPatient = await getFromStore('patients', editId);
            updatePatientBars();
            showAllergyWarning();
        }
    } catch (error) {
        showMessage('patient-form-message', '保存に失敗しました: ' + error.message, 'error');
    }
}

/**
 * 患者を削除（関連データも全削除）
 * @param {string} patientId
 */
async function deletePatient(patientId) {
    const ok = await showConfirm(
        '患者の削除',
        'この患者とすべての関連データ（診療記録・処方・検査結果）を削除します。この操作は取り消せません。',
        '削除',
        'btn-danger'
    );
    if (!ok) return;

    try {
        // 関連レコードを削除
        const records = await getByIndex('records', 'patientId', patientId);
        for (const r of records) {
            await deleteMediaByParent(r.id);
            await deleteFromStore('records', r.id);
        }

        const prescriptions = await getByIndex('prescriptions', 'patientId', patientId);
        for (const rx of prescriptions) {
            await deleteFromStore('prescriptions', rx.id);
        }

        const labs = await getByIndex('lab_results', 'patientId', patientId);
        for (const lab of labs) {
            await deleteMediaByParent(lab.id);
            await deleteFromStore('lab_results', lab.id);
        }

        // 患者のメディアを削除
        await deleteMediaByParent(patientId);

        // 患者本体を削除
        await deleteFromStore('patients', patientId);

        // 選択中の患者だった場合は選択解除
        if (selectedPatientId === patientId) {
            deselectPatient();
        }

        await loadPatients();
    } catch (error) {
        showMessage('patient-form-message', '削除に失敗しました: ' + error.message, 'error');
    }
}

/**
 * 患者検索を初期化
 */
function initPatientSearch() {
    const searchInput = document.getElementById('patient-search');
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        const cards = document.querySelectorAll('.patient-card');
        cards.forEach(card => {
            if (!query) {
                card.style.display = '';
                return;
            }
            const name = (card.querySelector('.patient-name')?.textContent || '').toLowerCase();
            const code = (card.querySelector('.patient-code')?.textContent || '').toLowerCase();
            // data属性からpatientIdを取得して完全検索するか、表示テキストでフィルタ
            const text = card.textContent.toLowerCase();
            card.style.display = text.includes(query) ? '' : 'none';
        });
    });
}

// ===== 診療記録 (SOAP + バイタル) 管理 =====

/**
 * 診療記録を保存
 */
async function saveRecord() {
    if (!selectedPatientId) {
        showMessage('record-message', '患者を選択してください', 'error');
        return;
    }

    const visitedAt = document.getElementById('input-visited-at').value;
    const soapS = document.getElementById('input-soap-s').value.trim();
    const soapO = document.getElementById('input-soap-o').value.trim();
    const soapA = document.getElementById('input-soap-a').value.trim();
    const soapP = document.getElementById('input-soap-p').value.trim();

    const temperature = document.getElementById('input-temperature').value;
    const systolic = document.getElementById('input-systolic').value;
    const diastolic = document.getElementById('input-diastolic').value;
    const pulse = document.getElementById('input-pulse').value;
    const spo2 = document.getElementById('input-spo2').value;
    const respiratoryRate = document.getElementById('input-respiratory-rate').value;
    const weight = document.getElementById('input-weight').value;
    const height = document.getElementById('input-height').value;

    const treatmentMemo = document.getElementById('input-treatment-memo').value.trim();

    // SOAP バリデーション
    const soapValidation = validateSOAP({
        subjective: soapS,
        objective: soapO,
        assessment: soapA,
        plan: soapP
    });
    if (!soapValidation.valid) {
        showMessage('record-message', soapValidation.errors[0], 'error');
        return;
    }

    // バイタル バリデーション
    const vitalsValidation = validateVitals({
        temperature: temperature || null,
        systolic: systolic || null,
        diastolic: diastolic || null,
        pulse: pulse || null,
        spo2: spo2 || null,
        respiratoryRate: respiratoryRate || null,
        weight: weight || null,
        height: height || null
    });
    if (!vitalsValidation.valid) {
        showMessage('record-message', vitalsValidation.errors[0], 'error');
        return;
    }

    const now = new Date().toISOString();
    const record = {
        id: generateUUID(),
        patientId: selectedPatientId,
        visitedAt: visitedAt ? new Date(visitedAt).toISOString() : now,
        soap: {
            subjective: soapS || null,
            objective: soapO || null,
            assessment: soapA || null,
            plan: soapP || null
        },
        vitals: {
            temperature: temperature ? Number(temperature) : null,
            systolic: systolic ? Number(systolic) : null,
            diastolic: diastolic ? Number(diastolic) : null,
            pulse: pulse ? Number(pulse) : null,
            spo2: spo2 ? Number(spo2) : null,
            respiratoryRate: respiratoryRate ? Number(respiratoryRate) : null,
            weight: weight ? Number(weight) : null,
            height: height ? Number(height) : null
        },
        treatmentMemo: treatmentMemo || null,
        createdAt: now,
        updatedAt: now
    };

    try {
        await addToStore('records', record);
        await commitStagedMedia(record.id, 'record');
        showMessage('record-message', '診療記録を保存しました', 'success');
        resetKarteForm();
        await loadRecentRecords();
        showPrevPlanHint();
    } catch (error) {
        showMessage('record-message', '保存に失敗しました: ' + error.message, 'error');
    }
}

/**
 * 直近の記録を読み込んで表示
 */
async function loadRecentRecords() {
    if (!selectedPatientId) return;

    const records = await getByIndex('records', 'patientId', selectedPatientId);
    records.sort((a, b) => new Date(b.visitedAt) - new Date(a.visitedAt));
    const recent = records.slice(0, 3);

    const container = document.getElementById('recent-records-list');

    if (recent.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>まだ診療記録がありません</p></div>';
        return;
    }

    for (const r of recent) {
        r._media = await getMediaByParent(r.id);
    }
    container.innerHTML = recent.map(r => renderRecentRecord(r)).join('');
}

/**
 * 直近記録カードのHTML生成
 * @param {object} record
 * @returns {string}
 */
function renderRecentRecord(record) {
    const v = record.vitals || {};
    const soap = record.soap || {};

    let vitalsHtml = '';
    if (v.temperature != null) {
        vitalsHtml += `<span class="vital-tag">体温 ${v.temperature}℃</span>`;
    }
    if (v.systolic != null && v.diastolic != null) {
        const bpLabel = classifyBP(v.systolic, v.diastolic);
        const bpClass = classifyBPClass(bpLabel);
        vitalsHtml += `<span class="vital-tag">BP ${v.systolic}/${v.diastolic}</span>`;
        vitalsHtml += `<span class="badge ${bpClass}">${bpLabel}</span>`;
    }
    if (v.pulse != null) {
        vitalsHtml += `<span class="vital-tag">脈拍 ${v.pulse}bpm</span>`;
    }
    if (v.spo2 != null) {
        const spo2Info = classifySpo2(v.spo2);
        const spo2Class = spo2Info ? `spo2-${spo2Info.level}` : '';
        vitalsHtml += `<span class="vital-tag">SpO2 ${v.spo2}%</span>`;
        if (spo2Info) {
            vitalsHtml += `<span class="badge ${spo2Class}">${spo2Info.label}</span>`;
        }
    }
    if (v.respiratoryRate != null) {
        vitalsHtml += `<span class="vital-tag">呼吸数 ${v.respiratoryRate}回/分</span>`;
    }
    if (v.weight != null && v.height != null) {
        const bmiInfo = classifyBMI(v.weight, v.height);
        if (bmiInfo) {
            vitalsHtml += `<span class="vital-tag">BMI ${bmiInfo.bmi}</span>`;
            vitalsHtml += `<span class="badge bmi-badge">${bmiInfo.classification}</span>`;
        }
    } else if (v.weight != null) {
        vitalsHtml += `<span class="vital-tag">体重 ${v.weight}kg</span>`;
    }

    let soapSummary = '';
    if (soap.subjective) soapSummary += `<div class="soap-summary-item"><span class="soap-label soap-s">S</span> ${escapeHtml(soap.subjective)}</div>`;
    if (soap.objective) soapSummary += `<div class="soap-summary-item"><span class="soap-label soap-o">O</span> ${escapeHtml(soap.objective)}</div>`;
    if (soap.assessment) soapSummary += `<div class="soap-summary-item"><span class="soap-label soap-a">A</span> ${escapeHtml(soap.assessment)}</div>`;
    if (soap.plan) soapSummary += `<div class="soap-summary-item"><span class="soap-label soap-p">P</span> ${escapeHtml(soap.plan)}</div>`;

    const treatmentHtml = record.treatmentMemo
        ? `<div class="treatment-memo">${escapeHtml(record.treatmentMemo)}</div>`
        : '';

    const mediaHtml = (record._media && record._media.length > 0)
        ? `<div class="media-inline-thumbs">${record._media.map(m =>
            `<img src="${m.thumbnail}" alt="${escapeHtml(m.fileName)}" onclick="openMediaLightbox('${m.id}', 'saved')" class="media-inline-thumb">`
        ).join('')}</div>`
        : '';

    return `<div class="recent-record-card" data-record-id="${record.id}">
        <div class="record-header">
            <span class="record-date">${formatDateTime(record.visitedAt)}</span>
            <div class="record-actions">
                <button class="btn btn-sm" onclick="openEditRecord('${record.id}')">編集</button>
                <button class="btn btn-sm btn-danger" onclick="deleteRecord('${record.id}')">削除</button>
            </div>
        </div>
        <div class="record-vitals">${vitalsHtml}</div>
        <div class="record-soap">${soapSummary}</div>
        ${treatmentHtml}
        ${mediaHtml}
    </div>`;
}

/**
 * 記録編集モーダルを開く
 * @param {string} recordId
 */
async function openEditRecord(recordId) {
    const record = await getFromStore('records', recordId);
    if (!record) return;

    const v = record.vitals || {};
    const soap = record.soap || {};

    document.getElementById('edit-record-id').value = record.id;
    document.getElementById('edit-visited-at').value = formatDateTimeLocal(new Date(record.visitedAt));
    document.getElementById('edit-soap-s').value = soap.subjective || '';
    document.getElementById('edit-soap-o').value = soap.objective || '';
    document.getElementById('edit-soap-a').value = soap.assessment || '';
    document.getElementById('edit-soap-p').value = soap.plan || '';
    document.getElementById('edit-temperature').value = v.temperature != null ? v.temperature : '';
    document.getElementById('edit-systolic').value = v.systolic != null ? v.systolic : '';
    document.getElementById('edit-diastolic').value = v.diastolic != null ? v.diastolic : '';
    document.getElementById('edit-pulse').value = v.pulse != null ? v.pulse : '';
    document.getElementById('edit-spo2').value = v.spo2 != null ? v.spo2 : '';
    document.getElementById('edit-respiratory-rate').value = v.respiratoryRate != null ? v.respiratoryRate : '';
    document.getElementById('edit-weight').value = v.weight != null ? v.weight : '';
    document.getElementById('edit-height').value = v.height != null ? v.height : '';
    document.getElementById('edit-treatment-memo').value = record.treatmentMemo || '';

    document.getElementById('edit-record-overlay').classList.add('show');
}

/**
 * 記録編集を保存
 * @param {Event} event
 */
async function saveEditRecord(event) {
    event.preventDefault();

    const id = document.getElementById('edit-record-id').value;
    const original = await getFromStore('records', id);
    if (!original) return;

    const visitedAt = document.getElementById('edit-visited-at').value;
    const soapS = document.getElementById('edit-soap-s').value.trim();
    const soapO = document.getElementById('edit-soap-o').value.trim();
    const soapA = document.getElementById('edit-soap-a').value.trim();
    const soapP = document.getElementById('edit-soap-p').value.trim();

    const temperature = document.getElementById('edit-temperature').value;
    const systolic = document.getElementById('edit-systolic').value;
    const diastolic = document.getElementById('edit-diastolic').value;
    const pulse = document.getElementById('edit-pulse').value;
    const spo2 = document.getElementById('edit-spo2').value;
    const respiratoryRate = document.getElementById('edit-respiratory-rate').value;
    const weight = document.getElementById('edit-weight').value;
    const height = document.getElementById('edit-height').value;
    const treatmentMemo = document.getElementById('edit-treatment-memo').value.trim();

    // SOAP バリデーション
    const soapValidation = validateSOAP({
        subjective: soapS,
        objective: soapO,
        assessment: soapA,
        plan: soapP
    });
    if (!soapValidation.valid) {
        alert(soapValidation.errors[0]);
        return;
    }

    // バイタル バリデーション
    const vitalsValidation = validateVitals({
        temperature: temperature || null,
        systolic: systolic || null,
        diastolic: diastolic || null,
        pulse: pulse || null,
        spo2: spo2 || null,
        respiratoryRate: respiratoryRate || null,
        weight: weight || null,
        height: height || null
    });
    if (!vitalsValidation.valid) {
        alert(vitalsValidation.errors[0]);
        return;
    }

    const updated = {
        ...original,
        visitedAt: visitedAt ? new Date(visitedAt).toISOString() : original.visitedAt,
        soap: {
            subjective: soapS || null,
            objective: soapO || null,
            assessment: soapA || null,
            plan: soapP || null
        },
        vitals: {
            temperature: temperature ? Number(temperature) : null,
            systolic: systolic ? Number(systolic) : null,
            diastolic: diastolic ? Number(diastolic) : null,
            pulse: pulse ? Number(pulse) : null,
            spo2: spo2 ? Number(spo2) : null,
            respiratoryRate: respiratoryRate ? Number(respiratoryRate) : null,
            weight: weight ? Number(weight) : null,
            height: height ? Number(height) : null
        },
        treatmentMemo: treatmentMemo || null,
        updatedAt: new Date().toISOString()
    };

    try {
        await updateInStore('records', updated);
        document.getElementById('edit-record-overlay').classList.remove('show');
        await loadRecentRecords();
    } catch (error) {
        alert('更新に失敗しました: ' + error.message);
    }
}

/**
 * 診療記録を削除
 * @param {string} recordId
 */
async function deleteRecord(recordId) {
    const ok = await showConfirm('記録の削除', 'この診療記録を削除しますか？', '削除', 'btn-danger');
    if (!ok) return;

    try {
        await deleteMediaByParent(recordId);
        await deleteFromStore('records', recordId);
        await loadRecentRecords();
        showPrevPlanHint();
    } catch (error) {
        showMessage('record-message', '削除に失敗しました: ' + error.message, 'error');
    }
}

/**
 * カルテフォームをリセット
 */
function resetKarteForm() {
    document.getElementById('input-soap-s').value = '';
    document.getElementById('input-soap-o').value = '';
    document.getElementById('input-soap-a').value = '';
    document.getElementById('input-soap-p').value = '';
    document.getElementById('input-temperature').value = '';
    document.getElementById('input-systolic').value = '';
    document.getElementById('input-diastolic').value = '';
    document.getElementById('input-pulse').value = '';
    document.getElementById('input-spo2').value = '';
    document.getElementById('input-respiratory-rate').value = '';
    document.getElementById('input-weight').value = '';
    document.getElementById('input-height').value = '';
    document.getElementById('input-treatment-memo').value = '';
    document.getElementById('input-visited-at').value = formatDateTimeLocal(new Date());
    clearMediaStaging('record');
    const recordMediaGrid = document.querySelector('#record-media-area .media-thumb-grid');
    if (recordMediaGrid) recordMediaGrid.innerHTML = '';
}

/**
 * 前回Planのヒントを表示
 */
async function showPrevPlanHint() {
    const hintEl = document.getElementById('prev-plan-hint');
    if (!selectedPatientId) {
        hintEl.style.display = 'none';
        return;
    }

    const records = await getByIndex('records', 'patientId', selectedPatientId);
    records.sort((a, b) => new Date(b.visitedAt) - new Date(a.visitedAt));

    if (records.length > 0 && records[0].soap && records[0].soap.plan) {
        hintEl.innerHTML = `<strong>前回のPlan:</strong> ${escapeHtml(records[0].soap.plan)}`;
        hintEl.style.display = '';
    } else {
        hintEl.style.display = 'none';
    }
}

// ===== 処方管理 =====

/**
 * 処方を保存
 */
async function savePrescription() {
    if (!selectedPatientId) {
        showMessage('prescription-message', '患者を選択してください', 'error');
        return;
    }

    const prescribedAt = document.getElementById('input-prescribed-at').value;
    const medicine = document.getElementById('input-medicine').value.trim();
    const dosage = document.getElementById('input-dosage').value.trim() || null;
    const frequency = document.getElementById('input-frequency').value.trim() || null;
    const days = document.getElementById('input-days').value;
    const memo = document.getElementById('input-prescription-memo').value.trim() || null;

    // バリデーション
    const validation = validatePrescription({
        medicine,
        days: days || null
    });
    if (!validation.valid) {
        showMessage('prescription-message', validation.errors[0], 'error');
        return;
    }

    const now = new Date().toISOString();
    const prescription = {
        id: generateUUID(),
        patientId: selectedPatientId,
        prescribedAt: prescribedAt || new Date().toISOString().split('T')[0],
        medicine,
        dosage,
        frequency,
        days: days ? Number(days) : null,
        memo,
        createdAt: now,
        updatedAt: now
    };

    try {
        await addToStore('prescriptions', prescription);
        showMessage('prescription-message', '処方を保存しました', 'success');

        // フォームリセット
        document.getElementById('input-medicine').value = '';
        document.getElementById('input-dosage').value = '';
        document.getElementById('input-frequency').value = '';
        document.getElementById('input-days').value = '';
        document.getElementById('input-prescription-memo').value = '';

        await loadPrescriptions();
    } catch (error) {
        showMessage('prescription-message', '保存に失敗しました: ' + error.message, 'error');
    }
}

/**
 * 処方一覧を読み込んで表示
 */
async function loadPrescriptions() {
    if (!selectedPatientId) return;

    const prescriptions = await getByIndex('prescriptions', 'patientId', selectedPatientId);
    prescriptions.sort((a, b) => new Date(b.prescribedAt) - new Date(a.prescribedAt));

    const container = document.getElementById('prescription-list');

    if (prescriptions.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>処方履歴がありません</p></div>';
        return;
    }

    container.innerHTML = prescriptions.map(rx => renderPrescriptionItem(rx)).join('');
}

/**
 * 処方アイテムのHTML生成
 * @param {object} rx
 * @returns {string}
 */
function renderPrescriptionItem(rx) {
    const dosageText = rx.dosage ? `${escapeHtml(rx.dosage)}` : '';
    const frequencyText = rx.frequency ? `${escapeHtml(rx.frequency)}` : '';
    const daysText = rx.days != null ? `${rx.days}日分` : '';
    const detailParts = [dosageText, frequencyText, daysText].filter(Boolean).join(' / ');
    const memoHtml = rx.memo ? `<div class="prescription-memo">${escapeHtml(rx.memo)}</div>` : '';

    return `<div class="prescription-item" data-id="${rx.id}">
        <div class="prescription-header">
            <span class="prescription-date">${formatDate(rx.prescribedAt)}</span>
            <div class="prescription-actions">
                <button class="btn btn-sm" onclick="openEditPrescription('${rx.id}')">編集</button>
                <button class="btn btn-sm btn-danger" onclick="deletePrescription('${rx.id}')">削除</button>
            </div>
        </div>
        <div class="prescription-medicine">${escapeHtml(rx.medicine)}</div>
        ${detailParts ? `<div class="prescription-detail">${detailParts}</div>` : ''}
        ${memoHtml}
    </div>`;
}

/**
 * 処方編集モーダルを開く
 * @param {string} id
 */
async function openEditPrescription(id) {
    const rx = await getFromStore('prescriptions', id);
    if (!rx) return;

    document.getElementById('edit-prescription-id').value = rx.id;
    document.getElementById('edit-prescribed-at').value = rx.prescribedAt || '';
    document.getElementById('edit-medicine').value = rx.medicine || '';
    document.getElementById('edit-dosage').value = rx.dosage || '';
    document.getElementById('edit-frequency').value = rx.frequency || '';
    document.getElementById('edit-days').value = rx.days != null ? rx.days : '';
    document.getElementById('edit-prescription-memo').value = rx.memo || '';

    document.getElementById('edit-prescription-overlay').classList.add('show');
}

/**
 * 処方編集を保存
 * @param {Event} event
 */
async function saveEditPrescription(event) {
    event.preventDefault();

    const id = document.getElementById('edit-prescription-id').value;
    const original = await getFromStore('prescriptions', id);
    if (!original) return;

    const prescribedAt = document.getElementById('edit-prescribed-at').value;
    const medicine = document.getElementById('edit-medicine').value.trim();
    const dosage = document.getElementById('edit-dosage').value.trim() || null;
    const frequency = document.getElementById('edit-frequency').value.trim() || null;
    const days = document.getElementById('edit-days').value;
    const memo = document.getElementById('edit-prescription-memo').value.trim() || null;

    const validation = validatePrescription({
        medicine,
        days: days || null
    });
    if (!validation.valid) {
        alert(validation.errors[0]);
        return;
    }

    const updated = {
        ...original,
        prescribedAt: prescribedAt || original.prescribedAt,
        medicine,
        dosage,
        frequency,
        days: days ? Number(days) : null,
        memo,
        updatedAt: new Date().toISOString()
    };

    try {
        await updateInStore('prescriptions', updated);
        document.getElementById('edit-prescription-overlay').classList.remove('show');
        await loadPrescriptions();
    } catch (error) {
        alert('更新に失敗しました: ' + error.message);
    }
}

/**
 * 処方を削除
 * @param {string} id
 */
async function deletePrescription(id) {
    const ok = await showConfirm('処方の削除', 'この処方を削除しますか？', '削除', 'btn-danger');
    if (!ok) return;

    try {
        await deleteFromStore('prescriptions', id);
        await loadPrescriptions();
    } catch (error) {
        showMessage('prescription-message', '削除に失敗しました: ' + error.message, 'error');
    }
}

// ===== 検査結果管理 =====

/**
 * 検査結果を保存
 */
async function saveLabResult() {
    if (!selectedPatientId) {
        showMessage('lab-message', '患者を選択してください', 'error');
        return;
    }

    const examinedAt = document.getElementById('input-examined-at').value;
    const category = document.getElementById('input-lab-category').value;
    const itemName = document.getElementById('input-lab-item').value.trim();
    const value = document.getElementById('input-lab-value').value.trim();
    const unit = document.getElementById('input-lab-unit').value.trim() || null;
    const referenceMin = document.getElementById('input-lab-ref-min').value.trim() || null;
    const referenceMax = document.getElementById('input-lab-ref-max').value.trim() || null;
    let judgment = document.getElementById('input-lab-judgment').value || null;
    const memo = document.getElementById('input-lab-memo').value.trim() || null;

    // バリデーション
    const validation = validateLabResult({ category, itemName, value });
    if (!validation.valid) {
        showMessage('lab-message', validation.errors[0], 'error');
        return;
    }

    // 自動判定
    if (!judgment) {
        judgment = judgeLabValue(value, referenceMin, referenceMax);
    }

    const now = new Date().toISOString();
    const labResult = {
        id: generateUUID(),
        patientId: selectedPatientId,
        examinedAt: examinedAt || new Date().toISOString().split('T')[0],
        category,
        itemName,
        value,
        unit,
        referenceMin: referenceMin ? Number(referenceMin) : null,
        referenceMax: referenceMax ? Number(referenceMax) : null,
        judgment,
        memo,
        createdAt: now,
        updatedAt: now
    };

    try {
        await addToStore('lab_results', labResult);
        await commitStagedMedia(labResult.id, 'lab_result');
        showMessage('lab-message', '検査結果を保存しました', 'success');

        // フォームリセット
        document.getElementById('input-lab-item').value = '';
        document.getElementById('input-lab-value').value = '';
        document.getElementById('input-lab-unit').value = '';
        document.getElementById('input-lab-ref-min').value = '';
        document.getElementById('input-lab-ref-max').value = '';
        document.getElementById('input-lab-judgment').value = '';
        document.getElementById('input-lab-memo').value = '';
        clearMediaStaging('lab_result');
        const labMediaGrid = document.querySelector('#lab-media-area .media-thumb-grid');
        if (labMediaGrid) labMediaGrid.innerHTML = '';

        await loadLabResults();
    } catch (error) {
        showMessage('lab-message', '保存に失敗しました: ' + error.message, 'error');
    }
}

/**
 * 検査結果一覧を読み込んで表示
 */
async function loadLabResults() {
    if (!selectedPatientId) return;

    const labs = await getByIndex('lab_results', 'patientId', selectedPatientId);

    // カテゴリフィルタ
    const filtered = currentLabFilter === 'all'
        ? labs
        : labs.filter(l => l.category === currentLabFilter);

    filtered.sort((a, b) => new Date(b.examinedAt) - new Date(a.examinedAt));

    const container = document.getElementById('lab-results-list');

    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>検査結果がありません</p></div>';
        return;
    }

    for (const lab of filtered) {
        lab._media = await getMediaByParent(lab.id);
    }
    container.innerHTML = filtered.map(lab => renderLabResultItem(lab)).join('');
}

/**
 * 検査結果アイテムのHTML生成
 * @param {object} lab
 * @returns {string}
 */
function renderLabResultItem(lab) {
    const judgmentMap = {
        normal: { label: '正常', cls: 'judgment-normal' },
        caution: { label: '要注意', cls: 'judgment-caution' },
        abnormal: { label: '異常', cls: 'judgment-abnormal' }
    };
    const judgmentInfo = judgmentMap[lab.judgment] || null;
    const judgmentBadge = judgmentInfo
        ? `<span class="badge ${judgmentInfo.cls}">${judgmentInfo.label}</span>`
        : '';

    const refText = (lab.referenceMin != null || lab.referenceMax != null)
        ? `基準: ${lab.referenceMin != null ? lab.referenceMin : '---'} 〜 ${lab.referenceMax != null ? lab.referenceMax : '---'}`
        : '';

    const categoryMap = {
        blood: '血液',
        urine: '尿',
        image: '画像',
        other: 'その他'
    };
    const categoryLabel = categoryMap[lab.category] || lab.category;

    const memoHtml = lab.memo ? `<div class="lab-memo">${escapeHtml(lab.memo)}</div>` : '';

    const labMediaHtml = (lab._media && lab._media.length > 0)
        ? `<div class="media-inline-thumbs">${lab._media.map(m =>
            `<img src="${m.thumbnail}" alt="${escapeHtml(m.fileName)}" onclick="openMediaLightbox('${m.id}', 'saved')" class="media-inline-thumb">`
        ).join('')}</div>`
        : '';

    return `<div class="lab-result-item" data-id="${lab.id}">
        <div class="lab-result-header">
            <span class="lab-date">${formatDate(lab.examinedAt)}</span>
            <span class="lab-category">${categoryLabel}</span>
            <div class="lab-actions">
                <button class="btn btn-sm" onclick="openEditLabResult('${lab.id}')">編集</button>
                <button class="btn btn-sm btn-danger" onclick="deleteLabResult('${lab.id}')">削除</button>
            </div>
        </div>
        <div class="lab-result-body">
            <span class="lab-item-name">${escapeHtml(lab.itemName)}</span>
            <span class="lab-value">${escapeHtml(lab.value)}${lab.unit ? ' ' + escapeHtml(lab.unit) : ''}</span>
            ${judgmentBadge}
        </div>
        ${refText ? `<div class="lab-reference">${refText}</div>` : ''}
        ${memoHtml}
        ${labMediaHtml}
    </div>`;
}

/**
 * 検査結果編集モーダルを開く
 * @param {string} id
 */
async function openEditLabResult(id) {
    const lab = await getFromStore('lab_results', id);
    if (!lab) return;

    document.getElementById('edit-lab-id').value = lab.id;
    document.getElementById('edit-examined-at').value = lab.examinedAt || '';
    document.getElementById('edit-lab-category').value = lab.category || 'blood';
    document.getElementById('edit-lab-item').value = lab.itemName || '';
    document.getElementById('edit-lab-value').value = lab.value || '';
    document.getElementById('edit-lab-unit').value = lab.unit || '';
    document.getElementById('edit-lab-ref-min').value = lab.referenceMin != null ? lab.referenceMin : '';
    document.getElementById('edit-lab-ref-max').value = lab.referenceMax != null ? lab.referenceMax : '';
    document.getElementById('edit-lab-judgment').value = lab.judgment || '';
    document.getElementById('edit-lab-memo').value = lab.memo || '';

    document.getElementById('edit-lab-overlay').classList.add('show');
}

/**
 * 検査結果編集を保存
 * @param {Event} event
 */
async function saveEditLabResult(event) {
    event.preventDefault();

    const id = document.getElementById('edit-lab-id').value;
    const original = await getFromStore('lab_results', id);
    if (!original) return;

    const examinedAt = document.getElementById('edit-examined-at').value;
    const category = document.getElementById('edit-lab-category').value;
    const itemName = document.getElementById('edit-lab-item').value.trim();
    const value = document.getElementById('edit-lab-value').value.trim();
    const unit = document.getElementById('edit-lab-unit').value.trim() || null;
    const referenceMin = document.getElementById('edit-lab-ref-min').value.trim() || null;
    const referenceMax = document.getElementById('edit-lab-ref-max').value.trim() || null;
    let judgment = document.getElementById('edit-lab-judgment').value || null;
    const memo = document.getElementById('edit-lab-memo').value.trim() || null;

    const validation = validateLabResult({ category, itemName, value });
    if (!validation.valid) {
        alert(validation.errors[0]);
        return;
    }

    // 自動判定
    if (!judgment) {
        judgment = judgeLabValue(value, referenceMin, referenceMax);
    }

    const updated = {
        ...original,
        examinedAt: examinedAt || original.examinedAt,
        category,
        itemName,
        value,
        unit,
        referenceMin: referenceMin ? Number(referenceMin) : null,
        referenceMax: referenceMax ? Number(referenceMax) : null,
        judgment,
        memo,
        updatedAt: new Date().toISOString()
    };

    try {
        await updateInStore('lab_results', updated);
        document.getElementById('edit-lab-overlay').classList.remove('show');
        await loadLabResults();
    } catch (error) {
        alert('更新に失敗しました: ' + error.message);
    }
}

/**
 * 検査結果を削除
 * @param {string} id
 */
async function deleteLabResult(id) {
    const ok = await showConfirm('検査結果の削除', 'この検査結果を削除しますか？', '削除', 'btn-danger');
    if (!ok) return;

    try {
        await deleteMediaByParent(id);
        await deleteFromStore('lab_results', id);
        await loadLabResults();
    } catch (error) {
        showMessage('lab-message', '削除に失敗しました: ' + error.message, 'error');
    }
}

/**
 * 検査フィルタを初期化
 */
function initLabFilter() {
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentLabFilter = btn.dataset.category;
            loadLabResults();
        });
    });
}

// ===== タブナビゲーション =====

/**
 * タブ切り替え初期化
 */
function initTabs() {
    const buttons = document.querySelectorAll('#tab-nav button');
    buttons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const tabId = btn.dataset.tab;
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
            document.getElementById(`tab-${tabId}`).classList.add('active');
            // タブ別リフレッシュ
            if (tabId === 'karte' && selectedPatientId) await refreshKarteTab();
            if (tabId === 'history' && selectedPatientId) await loadHistory();
            if (tabId === 'lab' && selectedPatientId) await loadLabResults();
        });
    });
}

// ===== 数値入力フォーカス時全選択 =====

/**
 * number入力にフォーカス時全選択イベントを設定
 */
function initSelectOnFocus() {
    document.querySelectorAll('input[type="number"], textarea').forEach(el => {
        el.addEventListener('focus', () => el.select());
    });
}

// === END OF PART 1 ===
// === PART 2: Advanced Features ===
// History Timeline, Charts, Export/Import, AI Diagnosis, PWA, Init

// ============================================================
// 1. History Timeline
// ============================================================

/**
 * 履歴タイムラインを読み込み・描画
 */
async function loadHistory() {
    if (!selectedPatientId) return;

    const container = document.getElementById('timeline-container');
    const paginationEl = document.getElementById('timeline-pagination');
    if (!container) return;

    try {
        const [records, prescriptions, labResults] = await Promise.all([
            getRecordsByPatient(selectedPatientId),
            getPrescriptionsByPatient(selectedPatientId),
            getLabResultsByPatient(selectedPatientId)
        ]);

        // タイムラインイベントに変換
        const events = [];

        for (const r of records) {
            r._media = await getMediaByParent(r.id);
            events.push({
                type: 'record',
                date: r.visitedAt,
                data: r
            });
        }
        for (const p of prescriptions) {
            events.push({
                type: 'prescription',
                date: p.prescribedAt,
                data: p
            });
        }
        for (const l of labResults) {
            l._media = await getMediaByParent(l.id);
            events.push({
                type: 'lab',
                date: l.examinedAt,
                data: l
            });
        }

        // ソート
        events.sort((a, b) => {
            const diff = new Date(b.date) - new Date(a.date);
            return historySortDesc ? diff : -diff;
        });

        if (events.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>履歴がありません</p></div>';
            if (paginationEl) paginationEl.innerHTML = '';
            return;
        }

        // ページネーション計算
        const totalPages = Math.ceil(events.length / HISTORY_PAGE_SIZE);
        if (historyPage > totalPages) historyPage = totalPages;
        if (historyPage < 1) historyPage = 1;

        const startIdx = (historyPage - 1) * HISTORY_PAGE_SIZE;
        const pageEvents = events.slice(startIdx, startIdx + HISTORY_PAGE_SIZE);

        // 月ごとにグループ化
        const groups = {};
        for (const ev of pageEvents) {
            const d = new Date(ev.date);
            const monthKey = `${d.getFullYear()}年${d.getMonth() + 1}月`;
            if (!groups[monthKey]) groups[monthKey] = [];
            groups[monthKey].push(ev);
        }

        let html = '';
        for (const [monthLabel, entries] of Object.entries(groups)) {
            html += `<div class="timeline-month-group">`;
            html += `<div class="timeline-month-label">${escapeHtml(monthLabel)}</div>`;
            for (const entry of entries) {
                html += renderTimelineEntry(entry);
            }
            html += `</div>`;
        }

        container.innerHTML = html;
        renderTimelinePagination(totalPages);
    } catch (e) {
        container.innerHTML = '<div class="empty-state"><p>履歴の読み込みに失敗しました</p></div>';
    }
}

/**
 * タイムライン1エントリのHTML生成
 */
function renderTimelineEntry(entry) {
    const dateStr = formatDateTime(entry.date);

    if (entry.type === 'record') {
        const r = entry.data;
        const soapSummary = r.soap && r.soap.subjective
            ? escapeHtml(r.soap.subjective.substring(0, 50)) + (r.soap.subjective.length > 50 ? '...' : '')
            : '';

        let vitalParts = [];
        if (r.vitals) {
            if (r.vitals.systolic != null && r.vitals.diastolic != null) {
                vitalParts.push(`BP: ${r.vitals.systolic}/${r.vitals.diastolic}`);
            }
            if (r.vitals.pulse != null) vitalParts.push(`脈拍: ${r.vitals.pulse}`);
            if (r.vitals.temperature != null) vitalParts.push(`体温: ${r.vitals.temperature}℃`);
            if (r.vitals.spo2 != null) vitalParts.push(`SpO2: ${r.vitals.spo2}%`);
        }
        const vitalSummary = vitalParts.length > 0 ? vitalParts.join(' / ') : '';
        const treatmentMemo = r.treatmentMemo ? escapeHtml(r.treatmentMemo.substring(0, 80)) : '';
        const recordMediaHtml = (r._media && r._media.length > 0)
            ? `<div class="media-inline-thumbs">${r._media.map(m =>
                `<img src="${m.thumbnail}" alt="${escapeHtml(m.fileName)}" onclick="openMediaLightbox('${m.id}', 'saved')" class="media-inline-thumb">`
            ).join('')}</div>`
            : '';

        return `<div class="timeline-entry timeline-record" data-id="${r.id}">
            <div class="timeline-entry-header" onclick="this.parentElement.classList.toggle('expanded')">
                <span class="timeline-icon">🩺</span>
                <span class="timeline-date">${dateStr}</span>
                <span class="timeline-type-label">診療記録</span>
            </div>
            <div class="timeline-entry-body">
                ${soapSummary ? `<div class="timeline-soap"><strong>S:</strong> ${soapSummary}</div>` : ''}
                ${vitalSummary ? `<div class="timeline-vitals">${escapeHtml(vitalSummary)}</div>` : ''}
                ${treatmentMemo ? `<div class="timeline-treatment"><strong>施術:</strong> ${treatmentMemo}</div>` : ''}
                ${recordMediaHtml}
            </div>
        </div>`;
    }

    if (entry.type === 'prescription') {
        const p = entry.data;
        const dosageInfo = [p.dosage, p.frequency].filter(Boolean).join(' / ');
        return `<div class="timeline-entry timeline-prescription" data-id="${p.id}">
            <div class="timeline-entry-header" onclick="this.parentElement.classList.toggle('expanded')">
                <span class="timeline-icon">💊</span>
                <span class="timeline-date">${dateStr}</span>
                <span class="timeline-type-label">処方</span>
            </div>
            <div class="timeline-entry-body">
                <div class="timeline-medicine">${escapeHtml(p.medicine)}</div>
                ${dosageInfo ? `<div class="timeline-dosage">${escapeHtml(dosageInfo)}</div>` : ''}
                ${p.days ? `<div class="timeline-days">${p.days}日分</div>` : ''}
            </div>
        </div>`;
    }

    if (entry.type === 'lab') {
        const l = entry.data;
        const judgment = l.judgment || judgeLabValue(l.value, l.referenceMin, l.referenceMax);
        let badgeClass = '';
        let badgeLabel = '';
        if (judgment === 'normal') { badgeClass = 'badge-success'; badgeLabel = '正常'; }
        else if (judgment === 'caution') { badgeClass = 'badge-warning'; badgeLabel = '要注意'; }
        else if (judgment === 'abnormal') { badgeClass = 'badge-danger'; badgeLabel = '異常'; }

        const labMediaHtml = (l._media && l._media.length > 0)
            ? `<div class="media-inline-thumbs">${l._media.map(m =>
                `<img src="${m.thumbnail}" alt="${escapeHtml(m.fileName)}" onclick="openMediaLightbox('${m.id}', 'saved')" class="media-inline-thumb">`
            ).join('')}</div>`
            : '';

        return `<div class="timeline-entry timeline-lab" data-id="${l.id}">
            <div class="timeline-entry-header" onclick="this.parentElement.classList.toggle('expanded')">
                <span class="timeline-icon">🔬</span>
                <span class="timeline-date">${dateStr}</span>
                <span class="timeline-type-label">検査</span>
            </div>
            <div class="timeline-entry-body">
                <div class="timeline-lab-item">${escapeHtml(l.itemName)}: ${escapeHtml(l.value)}${l.unit ? ' ' + escapeHtml(l.unit) : ''}
                    ${badgeLabel ? `<span class="badge ${badgeClass}">${badgeLabel}</span>` : ''}
                </div>
                ${labMediaHtml}
            </div>
        </div>`;
    }

    return '';
}

/**
 * タイムラインページネーション描画
 */
function renderTimelinePagination(totalPages) {
    const paginationEl = document.getElementById('timeline-pagination');
    if (!paginationEl) return;

    if (totalPages <= 1) {
        paginationEl.innerHTML = '';
        return;
    }

    let html = '';
    // 前ページ
    html += `<button class="btn btn-sm" ${historyPage <= 1 ? 'disabled' : ''} onclick="historyPage = ${historyPage - 1}; loadHistory();">&laquo;</button>`;

    // ページ番号
    const maxButtons = 5;
    let startPage = Math.max(1, historyPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    if (endPage - startPage < maxButtons - 1) {
        startPage = Math.max(1, endPage - maxButtons + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="btn btn-sm ${i === historyPage ? 'active' : ''}" onclick="historyPage = ${i}; loadHistory();">${i}</button>`;
    }

    // 次ページ
    html += `<button class="btn btn-sm" ${historyPage >= totalPages ? 'disabled' : ''} onclick="historyPage = ${historyPage + 1}; loadHistory();">&raquo;</button>`;

    paginationEl.innerHTML = html;
}

/**
 * 履歴コントロール初期化
 */
function initHistoryControls() {
    const sortBtn = document.getElementById('sort-toggle-btn');
    if (sortBtn) {
        sortBtn.addEventListener('click', () => {
            historySortDesc = !historySortDesc;
            historyPage = 1;
            loadHistory();
        });
    }
}

// ============================================================
// 2. Vitals Chart (Chart.js)
// ============================================================

/**
 * バイタルチャートを更新
 */
async function refreshVitalsChart() {
    if (!selectedPatientId) return;

    const records = await getRecordsByPatient(selectedPatientId);
    let filtered = [...records].reverse(); // 古い順

    if (currentVitalsPeriod !== 'all') {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - Number(currentVitalsPeriod));
        filtered = filtered.filter(r => new Date(r.visitedAt) >= cutoff);
    }

    const ctx = document.getElementById('vitals-chart');
    if (!ctx) return;

    if (vitalsChart) {
        vitalsChart.destroy();
        vitalsChart = null;
    }

    if (filtered.length === 0) return;

    const labels = filtered.map(r => new Date(r.visitedAt));
    const systolicData = filtered.map(r => r.vitals && r.vitals.systolic != null ? r.vitals.systolic : null);
    const diastolicData = filtered.map(r => r.vitals && r.vitals.diastolic != null ? r.vitals.diastolic : null);
    const pulseData = filtered.map(r => r.vitals && r.vitals.pulse != null ? r.vitals.pulse : null);
    const spo2Data = filtered.map(r => r.vitals && r.vitals.spo2 != null ? r.vitals.spo2 : null);
    const tempData = filtered.map(r => r.vitals && r.vitals.temperature != null ? r.vitals.temperature : null);

    vitalsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '収縮期血圧 (mmHg)',
                    data: systolicData,
                    borderColor: '#dc2626',
                    backgroundColor: 'rgba(220, 38, 38, 0.1)',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: '#dc2626',
                    tension: 0.3,
                    fill: false,
                    yAxisID: 'y',
                    spanGaps: true
                },
                {
                    label: '拡張期血圧 (mmHg)',
                    data: diastolicData,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: '#2563eb',
                    tension: 0.3,
                    fill: false,
                    yAxisID: 'y',
                    spanGaps: true
                },
                {
                    label: '脈拍 (bpm)',
                    data: pulseData,
                    borderColor: '#16a34a',
                    backgroundColor: 'rgba(22, 163, 74, 0.1)',
                    borderWidth: 1.5,
                    pointRadius: 2,
                    pointBackgroundColor: '#16a34a',
                    borderDash: [4, 4],
                    tension: 0.3,
                    fill: false,
                    yAxisID: 'y1',
                    spanGaps: true
                },
                {
                    label: 'SpO2 (%)',
                    data: spo2Data,
                    borderColor: '#7c3aed',
                    backgroundColor: 'rgba(124, 58, 237, 0.1)',
                    borderWidth: 1.5,
                    pointRadius: 2,
                    pointBackgroundColor: '#7c3aed',
                    borderDash: [4, 4],
                    tension: 0.3,
                    fill: false,
                    yAxisID: 'y2',
                    spanGaps: true
                },
                {
                    label: '体温 (℃)',
                    data: tempData,
                    borderColor: '#ea580c',
                    backgroundColor: 'rgba(234, 88, 12, 0.1)',
                    borderWidth: 1.5,
                    pointRadius: 2,
                    pointBackgroundColor: '#ea580c',
                    borderDash: [4, 4],
                    tension: 0.3,
                    fill: false,
                    yAxisID: 'y3',
                    spanGaps: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { usePointStyle: true, padding: 12 }
                },
                tooltip: {
                    callbacks: {
                        title: function(items) {
                            if (items.length > 0) {
                                return formatDateTime(items[0].parsed.x);
                            }
                            return '';
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'day',
                        displayFormats: { day: 'MM/dd' }
                    },
                    title: { display: true, text: '日付' }
                },
                y: {
                    position: 'left',
                    title: { display: true, text: 'mmHg' },
                    suggestedMin: 40,
                    suggestedMax: 200,
                    grid: { color: 'rgba(0,0,0,0.06)' }
                },
                y1: {
                    position: 'right',
                    title: { display: true, text: 'bpm' },
                    suggestedMin: 40,
                    suggestedMax: 120,
                    grid: { drawOnChartArea: false },
                    display: pulseData.some(v => v != null)
                },
                y2: {
                    position: 'right',
                    title: { display: true, text: '%' },
                    suggestedMin: 85,
                    suggestedMax: 100,
                    grid: { drawOnChartArea: false },
                    display: spo2Data.some(v => v != null)
                },
                y3: {
                    position: 'right',
                    title: { display: true, text: '℃' },
                    suggestedMin: 35,
                    suggestedMax: 40,
                    grid: { drawOnChartArea: false },
                    display: tempData.some(v => v != null)
                }
            }
        },
        plugins: [{
            id: 'emrReferenceLinesPlugin',
            beforeDraw: function(chart) {
                const yScale = chart.scales.y;
                if (!yScale) return;
                const ctx2 = chart.ctx;
                const chartArea = chart.chartArea;

                const drawLine = (value, color, label) => {
                    const yPos = yScale.getPixelForValue(value);
                    if (yPos < chartArea.top || yPos > chartArea.bottom) return;
                    ctx2.save();
                    ctx2.strokeStyle = color;
                    ctx2.lineWidth = 1;
                    ctx2.setLineDash([6, 4]);
                    ctx2.beginPath();
                    ctx2.moveTo(chartArea.left, yPos);
                    ctx2.lineTo(chartArea.right, yPos);
                    ctx2.stroke();
                    ctx2.fillStyle = color;
                    ctx2.font = '10px sans-serif';
                    ctx2.textAlign = 'left';
                    ctx2.fillText(label, chartArea.left + 4, yPos - 4);
                    ctx2.restore();
                };

                drawLine(135, 'rgba(220, 38, 38, 0.5)', '基準 135');
                drawLine(85, 'rgba(37, 99, 235, 0.5)', '基準 85');
            }
        }]
    });
}

/**
 * バイタルチャート期間コントロール初期化
 */
function initVitalsChartControls() {
    const buttons = document.querySelectorAll('.chart-period-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentVitalsPeriod = btn.dataset.period === 'all' ? 'all' : Number(btn.dataset.period);
            refreshVitalsChart();
        });
    });
}

// ============================================================
// 3. Lab Chart (Chart.js)
// ============================================================

/**
 * 検査値チャートを更新
 */
async function refreshLabChart() {
    if (!selectedPatientId) return;

    const labResults = await getLabResultsByPatient(selectedPatientId);

    const ctx = document.getElementById('lab-chart');
    if (!ctx) return;

    if (labChart) {
        labChart.destroy();
        labChart = null;
    }

    // 数値検査結果のみ抽出しグループ化
    const numericResults = labResults.filter(r => {
        const num = parseFloat(r.value);
        return !isNaN(num);
    });

    if (numericResults.length === 0) return;

    // 項目名でグループ化
    const groups = {};
    for (const r of numericResults) {
        if (!groups[r.itemName]) {
            groups[r.itemName] = [];
        }
        groups[r.itemName].push(r);
    }

    // 各グループを日付順（古い順）にソート
    for (const key of Object.keys(groups)) {
        groups[key].sort((a, b) => new Date(a.examinedAt) - new Date(b.examinedAt));
    }

    // 色パレット
    const colors = [
        '#dc2626', '#2563eb', '#16a34a', '#7c3aed', '#ea580c',
        '#0891b2', '#d97706', '#be185d', '#4f46e5', '#059669'
    ];

    const datasets = [];
    const itemNames = Object.keys(groups);
    let annotations = [];

    itemNames.forEach((itemName, idx) => {
        const items = groups[itemName];
        const color = colors[idx % colors.length];

        datasets.push({
            label: itemName,
            data: items.map(r => ({
                x: new Date(r.examinedAt),
                y: parseFloat(r.value)
            })),
            borderColor: color,
            backgroundColor: color + '1a',
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: color,
            tension: 0.3,
            fill: false,
            spanGaps: true
        });

        // 基準範囲シェーディング（最初の項目のみ）
        if (idx === 0 && items.length > 0) {
            const refMin = items[0].referenceMin != null ? parseFloat(items[0].referenceMin) : null;
            const refMax = items[0].referenceMax != null ? parseFloat(items[0].referenceMax) : null;
            if (refMin != null && refMax != null && !isNaN(refMin) && !isNaN(refMax)) {
                annotations.push({
                    type: 'box',
                    yMin: refMin,
                    yMax: refMax,
                    backgroundColor: 'rgba(34, 197, 94, 0.08)',
                    borderWidth: 0,
                    label: {
                        display: true,
                        content: '基準範囲',
                        position: 'start',
                        font: { size: 10 },
                        color: 'rgba(34, 197, 94, 0.6)'
                    }
                });
            }
        }
    });

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false
        },
        plugins: {
            legend: {
                position: 'bottom',
                labels: { usePointStyle: true, padding: 12 }
            },
            tooltip: {
                callbacks: {
                    title: function(items) {
                        if (items.length > 0) {
                            return formatDate(items[0].parsed.x);
                        }
                        return '';
                    }
                }
            }
        },
        scales: {
            x: {
                type: 'time',
                time: {
                    unit: 'day',
                    displayFormats: { day: 'MM/dd' }
                },
                title: { display: true, text: '検査日' }
            },
            y: {
                title: { display: true, text: '検査値' },
                grid: { color: 'rgba(0,0,0,0.06)' }
            }
        }
    };

    // annotation pluginが利用可能な場合のみ設定
    if (annotations.length > 0 && typeof Chart !== 'undefined') {
        chartOptions.plugins.annotation = {
            annotations: annotations
        };
    }

    labChart = new Chart(ctx, {
        type: 'line',
        data: { datasets: datasets },
        options: chartOptions
    });
}

// ============================================================
// 4. Export / Import
// ============================================================

/**
 * 全データをJSONエクスポート
 */
async function exportData() {
    try {
        const patients = await getAllPatients();
        const allRecords = [];
        const allPrescriptions = [];
        const allLabResults = [];

        for (const p of patients) {
            const records = await getRecordsByPatient(p.id);
            const prescriptions = await getPrescriptionsByPatient(p.id);
            const labResults = await getLabResultsByPatient(p.id);
            allRecords.push(...records);
            allPrescriptions.push(...prescriptions);
            allLabResults.push(...labResults);
        }

        const allMedia = await getAllFromStore('media');
        const displaySettings = await loadDisplaySettings();

        const data = {
            version: (window.APP_INFO || {}).version || '1.0.0',
            appName: 'emr',
            exportedAt: new Date().toISOString(),
            patients: patients,
            records: allRecords,
            prescriptions: allPrescriptions,
            labResults: allLabResults,
            media: allMedia,
            aiMemo: localStorage.getItem('emr_ai_memo') || '',
            displaySettings: displaySettings
        };

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const filename = `emr_export_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`;

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        const mediaCount = allMedia.length;
        showMessage('data-message', `${patients.length}件の患者、${allRecords.length}件の記録、${mediaCount}件のメディアをエクスポートしました`, 'success');
    } catch (error) {
        showMessage('data-message', 'エクスポートに失敗しました: ' + error.message, 'error');
    }
}

/**
 * JSONインポート
 */
async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const data = JSON.parse(text);

        const validation = validateImportData(data);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        const pCount = data.patients.length;
        const rCount = data.records.length;
        const rxCount = data.prescriptions.length;
        const lCount = data.labResults.length;
        const mCount = (data.media && Array.isArray(data.media)) ? data.media.length : 0;

        const confirmed = await showConfirm(
            'データのインポート',
            `${pCount}件の患者、${rCount}件の記録、${rxCount}件の処方、${lCount}件の検査結果` +
            (mCount > 0 ? `、${mCount}件のメディア` : '') +
            `を読み込みます。既存データとマージされます。`,
            'インポート',
            'btn-primary'
        );
        if (!confirmed) {
            event.target.value = '';
            return;
        }

        // 既存IDを取得
        const existingPatients = await getAllPatients();
        const existingPatientIds = new Set(existingPatients.map(p => p.id));

        let importedPatients = 0;
        for (const p of data.patients) {
            if (!p.id) continue;
            if (existingPatientIds.has(p.id)) continue;
            await addPatient(p);
            importedPatients++;
        }

        // 各患者のrecords取得用キャッシュ
        let importedRecords = 0;
        for (const r of data.records) {
            if (!r.id) continue;
            try {
                const existing = await getRecord(r.id);
                if (existing) continue;
            } catch (e) { /* not found */ }
            await addRecord(r);
            importedRecords++;
        }

        let importedPrescriptions = 0;
        for (const rx of data.prescriptions) {
            if (!rx.id) continue;
            try {
                await addPrescription(rx);
                importedPrescriptions++;
            } catch (e) {
                // 重複IDはスキップ
            }
        }

        let importedLabResults = 0;
        for (const l of data.labResults) {
            if (!l.id) continue;
            try {
                await addLabResult(l);
                importedLabResults++;
            } catch (e) {
                // 重複IDはスキップ
            }
        }

        // メディアの復元
        let importedMedia = 0;
        if (data.media && Array.isArray(data.media)) {
            for (const m of data.media) {
                if (!m.id) continue;
                try {
                    await addToStore('media', m);
                    importedMedia++;
                } catch (e) {
                    // 重複IDはスキップ
                }
            }
        }

        // AI備考の復元
        if (data.aiMemo != null) {
            localStorage.setItem('emr_ai_memo', data.aiMemo);
            const aiMemoInput = document.getElementById('input-ai-memo');
            if (aiMemoInput) aiMemoInput.value = data.aiMemo;
        }

        // 表示設定の復元
        if (data.displaySettings) {
            await saveDisplaySettings(data.displaySettings);
            await initDisplaySettings();
        }

        showMessage('data-message',
            `インポート完了: 患者${importedPatients}件、記録${importedRecords}件、処方${importedPrescriptions}件、検査${importedLabResults}件` +
            (importedMedia > 0 ? `、メディア${importedMedia}件` : ''),
            'success'
        );

        // 患者リスト再描画
        await renderPatientList();
    } catch (error) {
        showMessage('data-message', 'インポートに失敗しました: ' + error.message, 'error');
    }

    event.target.value = '';
}

/**
 * 全データ削除
 */
async function deleteAllData() {
    const confirmed = await showConfirm('全データ削除', '全てのデータを削除します。この操作は取り消せません。本当に削除しますか？');
    if (!confirmed) return;

    try {
        const db = await openDB();

        // 全ストアをクリア
        const stores = [PATIENTS_STORE, RECORDS_STORE, PRESCRIPTIONS_STORE, LAB_RESULTS_STORE, MEDIA_STORE, APP_SETTINGS_STORE];
        await new Promise((resolve, reject) => {
            const tx = db.transaction(stores, 'readwrite');
            for (const storeName of stores) {
                tx.objectStore(storeName).clear();
            }
            tx.oncomplete = () => resolve();
            tx.onerror = (event) => reject(event.target.error);
        });

        // 患者選択解除
        selectedPatientId = null;

        // UI更新
        await renderPatientList();
        await initDisplaySettings();

        showMessage('data-message', '全データを削除しました', 'success');
    } catch (error) {
        showMessage('data-message', 'データ削除に失敗しました: ' + error.message, 'error');
    }
}

// ============================================================
// 5. AI Diagnosis
// ============================================================

const LS_KEY_API_KEY = 'emr_ai_key';
const LS_KEY_AI_MEMO = 'emr_ai_memo';
const LS_KEY_AI_MODEL = 'emr_ai_model';
const DEFAULT_AI_MODEL = 'gpt-4o-mini';

const AI_MODEL_CATALOG = {
    'gpt-4o-mini': { label: 'GPT-4o mini（低コスト）', contextWindow: 128000, inputPrice: 0.15, outputPrice: 0.60, useMaxCompletionTokens: false, supportsTemperature: true },
    'gpt-4.1-mini': { label: 'GPT-4.1 mini', contextWindow: 1047576, inputPrice: 0.40, outputPrice: 1.60, useMaxCompletionTokens: true, supportsTemperature: true },
    'gpt-4.1': { label: 'GPT-4.1（1Mコンテキスト）', contextWindow: 1047576, inputPrice: 2.00, outputPrice: 8.00, useMaxCompletionTokens: true, supportsTemperature: true },
    'gpt-4o': { label: 'GPT-4o', contextWindow: 128000, inputPrice: 2.50, outputPrice: 10.00, useMaxCompletionTokens: false, supportsTemperature: true },
    'gpt-5-mini': { label: 'GPT-5 mini（高速）', contextWindow: 400000, inputPrice: 1.10, outputPrice: 4.40, useMaxCompletionTokens: true, supportsTemperature: false },
    'gpt-5': { label: 'GPT-5', contextWindow: 400000, inputPrice: 2.00, outputPrice: 8.00, useMaxCompletionTokens: true, supportsTemperature: false },
    'gpt-5.2': { label: 'GPT-5.2（最新）', contextWindow: 400000, inputPrice: 2.00, outputPrice: 8.00, useMaxCompletionTokens: true, supportsTemperature: false }
};

let aiConversation = [];
let aiIsStreaming = false;

/**
 * AI会話をIndexedDBに保存
 */
async function saveAIConversation() {
    if (!selectedPatientId || aiConversation.length === 0) return;
    const record = {
        id: 'ai_conv_' + selectedPatientId,
        patientId: selectedPatientId,
        conversation: aiConversation,
        updatedAt: new Date().toISOString()
    };
    await updateInStore('ai_conversations', record).catch(() =>
        addToStore('ai_conversations', record)
    );
}

/**
 * AI会話をIndexedDBから読み込み
 * @returns {Promise<object|null>}
 */
async function loadAIConversation() {
    if (!selectedPatientId) return null;
    return await getFromStore('ai_conversations', 'ai_conv_' + selectedPatientId);
}

function getApiKey() {
    return (localStorage.getItem(LS_KEY_API_KEY) || '').trim();
}

function getAIMemo() {
    return (localStorage.getItem(LS_KEY_AI_MEMO) || '').trim();
}

function getSelectedAiModel() {
    try {
        const raw = localStorage.getItem(LS_KEY_AI_MODEL);
        const v = raw ? String(raw).trim() : '';
        return AI_MODEL_CATALOG[v] ? v : DEFAULT_AI_MODEL;
    } catch (e) {
        return DEFAULT_AI_MODEL;
    }
}

function setSelectedAiModel(modelId) {
    const m = (modelId && AI_MODEL_CATALOG[modelId]) ? modelId : DEFAULT_AI_MODEL;
    try { localStorage.setItem(LS_KEY_AI_MODEL, m); } catch (e) {}
    return m;
}

/**
 * AI診断タブの表示/非表示を切り替え
 */
function updateAITabVisibility() {
    const btn = document.getElementById('ai-tab-btn');
    if (btn) {
        btn.style.display = getApiKey() ? '' : 'none';
    }
}

/**
 * AI設定の初期化
 */
function initAISettings() {
    const apiKeyInput = document.getElementById('input-api-key');
    const savedKey = localStorage.getItem(LS_KEY_API_KEY) || '';
    if (savedKey && apiKeyInput) {
        apiKeyInput.value = savedKey;
    }

    const aiMemoInput = document.getElementById('input-ai-memo');
    const savedMemo = localStorage.getItem(LS_KEY_AI_MEMO) || '';
    if (savedMemo && aiMemoInput) {
        aiMemoInput.value = savedMemo;
    }

    // APIキー保存
    const saveKeyBtn = document.getElementById('save-api-key-btn');
    if (saveKeyBtn) {
        saveKeyBtn.addEventListener('click', () => {
            const key = apiKeyInput ? apiKeyInput.value.trim() : '';
            if (!key) {
                showMessage('ai-settings-message', 'APIキーを入力してください', 'error');
                return;
            }
            localStorage.setItem(LS_KEY_API_KEY, key);
            showMessage('ai-settings-message', 'APIキーを保存しました', 'success');
            updateAITabVisibility();
        });
    }

    // AI備考保存
    const saveMemoBtn = document.getElementById('save-ai-memo-btn');
    if (saveMemoBtn) {
        saveMemoBtn.addEventListener('click', () => {
            const memo = aiMemoInput ? aiMemoInput.value.trim() : '';
            localStorage.setItem(LS_KEY_AI_MEMO, memo);
            showMessage('ai-settings-message', '備考を保存しました', 'success');
        });
    }

    // モデル選択
    const aiModelSelect = document.getElementById('ai-model-select');
    const aiModelInfo = document.getElementById('ai-model-info');
    if (aiModelSelect) {
        // ドロップダウンにモデルを追加
        aiModelSelect.innerHTML = '';
        for (const [modelId, meta] of Object.entries(AI_MODEL_CATALOG)) {
            const opt = document.createElement('option');
            opt.value = modelId;
            opt.textContent = meta.label;
            aiModelSelect.appendChild(opt);
        }

        const currentModel = getSelectedAiModel();
        aiModelSelect.value = currentModel;

        const updateModelInfo = () => {
            const m = getSelectedAiModel();
            const meta = AI_MODEL_CATALOG[m];
            if (aiModelInfo && meta) {
                const ctx = meta.contextWindow.toLocaleString();
                aiModelInfo.textContent = `現在: ${meta.label}（model id: ${m}）/ コンテキスト: ${ctx} tokens / 入力: $${meta.inputPrice}/1M / 出力: $${meta.outputPrice}/1M`;
            }
        };
        updateModelInfo();

        aiModelSelect.addEventListener('change', () => {
            setSelectedAiModel(aiModelSelect.value);
            updateModelInfo();
        });
    }
}

/**
 * システムプロンプト生成
 */
function buildSystemPrompt() {
    return `あなたは電子カルテの診療支援AIです。
施術者の診療を補助するため、患者データに基づいた分析とアドバイスを提供してください。
以下のルールに従ってください：
- 医療行為の最終判断は施術者が行います。あくまで参考情報として回答してください。
- 患者のバイタルサイン、SOAP記録、検査値、処方情報を総合的に分析してください。
- バイタルの異常値や検査値の逸脱については具体的に指摘してください。
- 可能性のある疾患の鑑別、推奨される追加検査、治療方針について提案してください。
- 薬の相互作用やアレルギーとの関連に注意してください。
- 日本語で回答してください。
- 回答の最後に、施術者が次に確認すべき事項や質問候補を3つ、以下のフォーマットで必ず提示してください（本文との間に空行を入れてください）：
{{SUGGEST:質問テキスト1}}
{{SUGGEST:質問テキスト2}}
{{SUGGEST:質問テキスト3}}`;
}

/**
 * 患者データサマリー生成（プライバシー保護）
 */
async function buildPatientDataSummary() {
    if (!selectedPatientId) return '患者が選択されていません。';

    const patient = await getPatient(selectedPatientId);
    if (!patient) return '患者情報が見つかりません。';

    const records = await getRecordsByPatient(selectedPatientId);
    const prescriptions = await getPrescriptionsByPatient(selectedPatientId);
    const labResults = await getLabResultsByPatient(selectedPatientId);
    const aiMemo = getAIMemo();

    let summary = '';

    // 基本情報（プライバシー保護: 氏名、電話、住所、メール、保険証番号を除外）
    const age = patient.birthDate ? calcAge(patient.birthDate) : null;
    const genderMap = { male: '男性', female: '女性', other: 'その他' };
    summary += '【患者基本情報】\n';
    if (age != null) summary += `年齢: ${age}歳\n`;
    if (patient.gender) summary += `性別: ${genderMap[patient.gender] || patient.gender}\n`;

    // アレルギー情報
    if (patient.allergies && patient.allergies.length > 0) {
        summary += '\n【アレルギー情報】\n';
        for (const a of patient.allergies) {
            summary += `- ${a.allergen}（${a.type || ''}）`;
            if (a.symptoms) summary += ` 症状: ${a.symptoms}`;
            if (a.severity) summary += ` 重症度: ${a.severity}`;
            summary += '\n';
        }
    }

    // 既往歴
    if (patient.medicalHistory && patient.medicalHistory.length > 0) {
        summary += '\n【既往歴】\n';
        for (const h of patient.medicalHistory) {
            summary += `- ${h.disease}`;
            if (h.outcome) summary += `（${h.outcome}）`;
            if (h.diagnosedDate) summary += ` 診断日: ${h.diagnosedDate}`;
            summary += '\n';
        }
    }

    // SOAP記録（直近10件）
    if (records.length > 0) {
        summary += '\n【直近の診療記録（SOAP）】\n';
        const recentRecords = records.slice(0, 10);
        for (const r of recentRecords) {
            summary += `--- ${formatDateTime(r.visitedAt)} ---\n`;
            if (r.soap) {
                if (r.soap.subjective) summary += `S: ${r.soap.subjective}\n`;
                if (r.soap.objective) summary += `O: ${r.soap.objective}\n`;
                if (r.soap.assessment) summary += `A: ${r.soap.assessment}\n`;
                if (r.soap.plan) summary += `P: ${r.soap.plan}\n`;
            }
            if (r.vitals) {
                const vParts = [];
                if (r.vitals.temperature != null) vParts.push(`体温: ${r.vitals.temperature}℃`);
                if (r.vitals.systolic != null && r.vitals.diastolic != null) {
                    const bpCls = classifyBP(r.vitals.systolic, r.vitals.diastolic);
                    vParts.push(`BP: ${r.vitals.systolic}/${r.vitals.diastolic} mmHg (${bpCls})`);
                }
                if (r.vitals.pulse != null) vParts.push(`脈拍: ${r.vitals.pulse} bpm`);
                if (r.vitals.spo2 != null) vParts.push(`SpO2: ${r.vitals.spo2}%`);
                if (r.vitals.respiratoryRate != null) vParts.push(`呼吸数: ${r.vitals.respiratoryRate}`);
                if (r.vitals.weight != null) vParts.push(`体重: ${r.vitals.weight}kg`);
                if (r.vitals.height != null) vParts.push(`身長: ${r.vitals.height}cm`);
                if (vParts.length > 0) summary += `バイタル: ${vParts.join(', ')}\n`;
            }
            if (r.treatmentMemo) summary += `施術メモ: ${r.treatmentMemo}\n`;
        }
        if (records.length > 10) {
            summary += `（他 ${records.length - 10} 件の記録あり）\n`;
        }

        // バイタル統計
        const stats = calcVitalStats(records);
        summary += '\n【バイタル統計】\n';
        if (stats.systolic.avg != null) summary += `収縮期血圧 平均: ${stats.systolic.avg} (${stats.systolic.min}〜${stats.systolic.max})\n`;
        if (stats.diastolic.avg != null) summary += `拡張期血圧 平均: ${stats.diastolic.avg} (${stats.diastolic.min}〜${stats.diastolic.max})\n`;
        if (stats.pulse.avg != null) summary += `脈拍 平均: ${stats.pulse.avg} (${stats.pulse.min}〜${stats.pulse.max})\n`;
        if (stats.temperature.avg != null) summary += `体温 平均: ${stats.temperature.avg}\n`;
        if (stats.spo2.avg != null) summary += `SpO2 平均: ${stats.spo2.avg}\n`;
    }

    // 処方情報（直近10件）
    if (prescriptions.length > 0) {
        summary += '\n【処方情報（直近）】\n';
        const recentRx = prescriptions.slice(0, 10);
        for (const rx of recentRx) {
            let line = `${formatDate(rx.prescribedAt)}: ${rx.medicine}`;
            if (rx.dosage) line += ` ${rx.dosage}`;
            if (rx.frequency) line += ` ${rx.frequency}`;
            if (rx.days) line += ` ${rx.days}日分`;
            summary += line + '\n';
        }
        if (prescriptions.length > 10) {
            summary += `（他 ${prescriptions.length - 10} 件あり）\n`;
        }
    }

    // 検査結果（直近15件）
    if (labResults.length > 0) {
        summary += '\n【検査結果（直近）】\n';
        const recentLab = labResults.slice(0, 15);
        for (const l of recentLab) {
            const jdg = l.judgment || judgeLabValue(l.value, l.referenceMin, l.referenceMax);
            const jdgLabel = jdg === 'normal' ? '正常' : jdg === 'caution' ? '要注意' : jdg === 'abnormal' ? '異常' : '';
            let line = `${formatDate(l.examinedAt)}: ${l.itemName} = ${l.value}`;
            if (l.unit) line += ` ${l.unit}`;
            if (l.referenceMin != null || l.referenceMax != null) {
                line += ` (基準: ${l.referenceMin || ''}〜${l.referenceMax || ''})`;
            }
            if (jdgLabel) line += ` [${jdgLabel}]`;
            summary += line + '\n';
        }
        if (labResults.length > 15) {
            summary += `（他 ${labResults.length - 15} 件あり）\n`;
        }
    }

    // AI備考
    if (aiMemo) {
        summary += `\n【施術者備考（AI向け）】\n${aiMemo}\n`;
    }

    return summary;
}

/**
 * AI診断を開始
 */
async function startAIDiagnosis() {
    const apiKey = getApiKey();
    if (!apiKey) {
        showMessage('ai-settings-message', 'APIキーが設定されていません。設定タブで設定してください。', 'error');
        return;
    }

    if (!selectedPatientId) {
        showMessage('ai-settings-message', '患者を選択してください。', 'error');
        return;
    }

    aiConversation = [];
    renderAIChatMessages();

    const dataSummary = await buildPatientDataSummary();
    const userPrompt = dataSummary + '\n上記の患者データに基づいて、総合的な診療支援アドバイスをお願いします。';

    aiConversation.push({
        role: 'user',
        content: userPrompt,
        displayContent: '患者データに基づいた診療支援アドバイスをお願いします。'
    });
    renderAIChatMessages();

    document.getElementById('ai-chat-container').style.display = '';
    document.getElementById('ai-followup').style.display = '';

    await callOpenAI(apiKey, [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: userPrompt }
    ]);
}

/**
 * フォローアップ質問を送信
 */
async function sendFollowUp() {
    const input = document.getElementById('ai-followup-input');
    const text = input ? input.value.trim() : '';
    if (!text || aiIsStreaming) return;

    const apiKey = getApiKey();
    if (!apiKey) return;

    aiConversation.push({ role: 'user', content: text });
    input.value = '';
    renderAIChatMessages();

    const messages = [{ role: 'system', content: buildSystemPrompt() }];
    for (const msg of aiConversation) {
        messages.push({ role: msg.role, content: msg.content });
    }

    await callOpenAI(apiKey, messages);
}

/**
 * OpenAI APIをSSEストリーミングで呼び出し
 */
async function callOpenAI(apiKey, messages) {
    aiIsStreaming = true;
    const diagnoseBtn = document.getElementById('ai-diagnose-btn');
    if (diagnoseBtn) diagnoseBtn.disabled = true;

    aiConversation.push({ role: 'assistant', content: '' });
    renderAIChatMessages(true);

    try {
        const modelId = getSelectedAiModel();
        const meta = AI_MODEL_CATALOG[modelId] || {};
        const body = {
            model: modelId,
            messages: messages,
            stream: true
        };
        if (meta.supportsTemperature !== false) {
            body.temperature = 0.7;
        }
        if (meta.useMaxCompletionTokens) {
            body.max_completion_tokens = 2000;
        } else {
            body.max_tokens = 2000;
        }

        const openAiPath = 'v1/chat/completions';
        const requestInit = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
        };

        // まず /api/openai?path=* を試行、404なら /openai/* にフォールバック
        let response = await fetch(`/api/openai?path=${encodeURIComponent(openAiPath)}`, requestInit);
        if (response.status === 404) {
            response = await fetch(`/openai/${openAiPath}`, requestInit);
        }

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData.error?.message || `APIエラー (${response.status})`;
            throw new Error(errMsg);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;
                const dataStr = trimmed.slice(6);
                if (dataStr === '[DONE]') continue;

                try {
                    const parsed = JSON.parse(dataStr);
                    const delta = parsed.choices?.[0]?.delta?.content;
                    if (delta) {
                        fullContent += delta;
                        aiConversation[aiConversation.length - 1].content = fullContent;
                        updateLastAIMessage(fullContent, true);
                    }
                } catch (e) {
                    // SSEパースエラーは無視
                }
            }
        }

        aiConversation[aiConversation.length - 1].content = fullContent;
        updateLastAIMessage(fullContent, false);

        // 会話をIndexedDBに保存
        await saveAIConversation();
    } catch (error) {
        // 空のassistantメッセージを削除
        if (aiConversation.length > 0 &&
            aiConversation[aiConversation.length - 1].role === 'assistant' &&
            !aiConversation[aiConversation.length - 1].content) {
            aiConversation.pop();
        }
        showMessage('ai-settings-message', 'AIエラー: ' + error.message, 'error');
        renderAIChatMessages();
    } finally {
        aiIsStreaming = false;
        if (diagnoseBtn) diagnoseBtn.disabled = !selectedPatientId;
    }
}

/**
 * AIチャットメッセージを描画
 */
function renderAIChatMessages(streaming) {
    const container = document.getElementById('ai-chat-messages');
    if (!container) return;

    if (aiConversation.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>「AI診断を開始」で診療支援AIに相談できます。</p></div>';
        return;
    }

    let html = '';
    for (let i = 0; i < aiConversation.length; i++) {
        const msg = aiConversation[i];
        const displayText = msg.displayContent || msg.content;
        const isLast = i === aiConversation.length - 1;
        const showCursor = streaming && isLast && msg.role === 'assistant';
        const label = msg.role === 'user' ? 'あなた' : 'AI';

        const { mainContent, suggestions } = msg.role === 'assistant'
            ? parseSuggestions(displayText)
            : { mainContent: displayText, suggestions: [] };

        html += `<div class="ai-msg ${msg.role}">
            <div>
                <div class="ai-msg-label">${label}</div>
                <div class="ai-msg-bubble" id="${isLast ? 'ai-last-bubble' : ''}">${escapeHtml(mainContent)}${showCursor ? '<span class="ai-streaming-cursor"></span>' : ''}</div>
                ${(!streaming && isLast && msg.role === 'assistant') ? renderSuggestionsHTML(suggestions) : ''}
            </div>
        </div>`;
    }

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

/**
 * ストリーミング中の最後のAIメッセージを更新
 */
function updateLastAIMessage(content, streaming) {
    const bubble = document.getElementById('ai-last-bubble');
    if (bubble) {
        const { mainContent, suggestions } = parseSuggestions(content);
        bubble.innerHTML = escapeHtml(mainContent) + (streaming ? '<span class="ai-streaming-cursor"></span>' : '');

        // 既存のサジェストを削除
        const existingSuggestions = bubble.parentElement.querySelector('.ai-suggestions');
        if (existingSuggestions) existingSuggestions.remove();

        if (!streaming && suggestions.length > 0) {
            bubble.parentElement.insertAdjacentHTML('beforeend', renderSuggestionsHTML(suggestions));
        }

        const container = document.getElementById('ai-chat-messages');
        if (container) container.scrollTop = container.scrollHeight;
    }
}

/**
 * サジェストボタンのHTML生成
 */
function renderSuggestionsHTML(suggestions) {
    if (!suggestions || suggestions.length === 0) return '';
    let html = '<div class="ai-suggestions">';
    for (const s of suggestions) {
        html += `<button class="ai-suggestion-btn" onclick="sendSuggestion(this.textContent)">${escapeHtml(s)}</button>`;
    }
    html += '</div>';
    return html;
}

/**
 * サジェストクリック時の処理
 */
async function sendSuggestion(text) {
    if (aiIsStreaming) return;
    const input = document.getElementById('ai-followup-input');
    if (input) input.value = text;
    await sendFollowUp();
}

/**
 * AI診断の初期化
 */
function initAIDiagnosis() {
    const diagnoseBtn = document.getElementById('ai-diagnose-btn');
    if (diagnoseBtn) {
        diagnoseBtn.addEventListener('click', startAIDiagnosis);
    }

    const followupBtn = document.getElementById('ai-followup-btn');
    if (followupBtn) {
        followupBtn.addEventListener('click', sendFollowUp);
    }

    // Enterキーで送信（Shift+Enterは改行）
    const aiInput = document.getElementById('ai-followup-input');
    if (aiInput) {
        aiInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!aiIsStreaming && aiInput.value.trim()) {
                    sendFollowUp();
                }
            }
        });
    }

    // 保存済み会話の復元
    restoreAIConversation();
}

/**
 * 保存済みのAI会話を復元
 */
async function restoreAIConversation() {
    try {
        const saved = await loadAIConversation();
        if (saved && saved.conversation && saved.conversation.length > 0 &&
            saved.patientId === selectedPatientId) {
            aiConversation = saved.conversation;
            renderAIChatMessages();
            document.getElementById('ai-chat-container').style.display = '';
            document.getElementById('ai-followup').style.display = '';
        }
    } catch (e) {
        // 復元失敗は無視
    }
}

// ============================================================
// 6. PWA
// ============================================================

let swRegistration = null;
let lastUpdateCheck = 0;
const UPDATE_CHECK_THROTTLE_MS = 30000;

/**
 * Service Worker登録
 */
async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    const hadController = !!navigator.serviceWorker.controller;

    try {
        swRegistration = await navigator.serviceWorker.register('/sw.js');

        swRegistration.addEventListener('updatefound', () => {
            const newWorker = swRegistration.installing;
            if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'activated' && hadController) {
                        showUpdateBanner();
                    }
                });
            }
        });

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (hadController) {
                showUpdateBanner();
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                throttledUpdateCheck();
            }
        });
    } catch (e) {
        // SW登録失敗は無視（HTTP環境等）
    }
}

/**
 * スロットル付き更新チェック（最低30秒間隔）
 */
function throttledUpdateCheck() {
    const now = Date.now();
    if (now - lastUpdateCheck < UPDATE_CHECK_THROTTLE_MS) return;
    lastUpdateCheck = now;
    if (swRegistration) {
        swRegistration.update().catch(() => {});
    }
}

/**
 * 手動更新チェック
 */
async function checkForUpdate() {
    const statusEl = document.getElementById('update-check-status');
    if (!swRegistration) {
        if (statusEl) statusEl.textContent = 'Service Workerが未登録です';
        return;
    }

    if (statusEl) statusEl.textContent = '確認中...';

    try {
        await swRegistration.update();
        const waiting = swRegistration.waiting;
        const installing = swRegistration.installing;

        if (waiting || installing) {
            if (statusEl) statusEl.textContent = '新しいバージョンを検出しました';
            showUpdateBanner();
        } else {
            if (statusEl) statusEl.textContent = '最新バージョンです';
            setTimeout(() => {
                if (statusEl) statusEl.textContent = '';
            }, 3000);
        }
    } catch (e) {
        if (statusEl) statusEl.textContent = '確認に失敗しました';
    }
}

/**
 * 更新バナー表示
 */
function showUpdateBanner() {
    const banner = document.getElementById('update-banner');
    if (banner) banner.style.display = 'flex';
}

/**
 * 更新バナー非表示
 */
function hideUpdateBanner() {
    const banner = document.getElementById('update-banner');
    if (banner) banner.style.display = 'none';
}

/**
 * 更新バナーイベント初期化
 */
function initUpdateBanner() {
    const updateBtn = document.getElementById('update-banner-btn');
    if (updateBtn) {
        updateBtn.addEventListener('click', () => {
            location.reload();
        });
    }
    const closeBtn = document.getElementById('update-banner-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            hideUpdateBanner();
        });
    }
    const checkUpdateBtn = document.getElementById('check-update-btn');
    if (checkUpdateBtn) {
        checkUpdateBtn.addEventListener('click', checkForUpdate);
    }
}

/**
 * アプリバッジ更新
 * 当日記録がない患者がいればバッジ表示
 */
async function updateAppBadge() {
    if (!('setAppBadge' in navigator)) return;
    try {
        const patients = await getAllPatients();
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        let hasUnrecordedPatient = false;
        for (const p of patients) {
            const records = await getRecordsByPatient(p.id);
            const hasTodayRecord = records.some(r => {
                const d = new Date(r.visitedAt);
                const rStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                return rStr === todayStr;
            });
            if (!hasTodayRecord) {
                hasUnrecordedPatient = true;
                break;
            }
        }

        if (hasUnrecordedPatient) {
            navigator.setAppBadge(1);
        } else {
            navigator.clearAppBadge();
        }
    } catch (e) {
        // バッジ更新失敗は無視
    }
}

// ============================================================
// 7. Version Info + Scroll + URL tab
// ============================================================

/**
 * バージョン情報を表示
 */
function initVersionInfo() {
    const info = window.APP_INFO || {};

    const infoDisplay = document.getElementById('app-info-display');
    if (infoDisplay && info.version) {
        infoDisplay.innerHTML = `Ver: ${info.version}<br>Build: ${info.buildTime || '---'}`;
    }

    const versionDetail = document.getElementById('app-version-info');
    if (versionDetail && info.version) {
        versionDetail.textContent = `バージョン: ${info.version}`;
    }
}

/**
 * ページ先頭へ戻るボタン初期化
 */
function initScrollToTop() {
    try {
        const scrollToTop = () => {
            try {
                window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
            } catch (e) {
                window.scrollTo(0, 0);
            }
            document.querySelectorAll('.ai-chat-messages').forEach(el => {
                try { el.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { el.scrollTop = 0; }
            });
        };
        const scrollTopBtn = document.getElementById('scroll-to-top-btn');
        if (scrollTopBtn) scrollTopBtn.addEventListener('click', scrollToTop);
        const appHeader = document.querySelector('.app-header');
        if (appHeader) appHeader.addEventListener('click', scrollToTop);
    } catch (e) {
        // ボタン初期化失敗時は無視
    }
}

/**
 * URLのtabパラメータからタブを切り替え
 */
function handleTabFromUrl() {
    try {
        const params = new URLSearchParams(window.location.search);
        const tab = params.get('tab');
        if (tab) {
            const btn = document.querySelector(`.tab-nav button[data-tab="${tab}"]`);
            if (btn) btn.click();
        }
    } catch (e) {
        // URLパース失敗は無視
    }
}

// ============================================================
// 8. refreshKarteTab helper
// ============================================================

/**
 * カルテタブをリフレッシュ
 */
async function refreshKarteTab() {
    if (!selectedPatientId) return;
    await loadRecentRecords();
    refreshVitalsChart();
    showPrevPlanHint();
}

// ============================================================
// 9. 表示設定の適用・初期化
// ============================================================

function applyDisplaySettings(settings) {
    // タブの表示/非表示
    for (const [tabKey, visible] of Object.entries(settings.tabs)) {
        document.querySelectorAll(`[data-tab-key="${tabKey}"]`).forEach(el => {
            el.classList.toggle('tab-hidden', !visible);
        });
    }

    // 非表示タブが選択中ならpatientsタブにフォールバック
    const activeTabBtn = document.querySelector('#tab-nav button.active');
    if (activeTabBtn && activeTabBtn.classList.contains('tab-hidden')) {
        const patientsBtn = document.querySelector('#tab-nav button[data-tab="patients"]');
        if (patientsBtn) patientsBtn.click();
    }

    // フィールドの表示/非表示
    for (const [section, fields] of Object.entries(settings.fields)) {
        for (const [fieldName, visible] of Object.entries(fields)) {
            const key = `${section}.${fieldName}`;
            document.querySelectorAll(`[data-field-key="${key}"]`).forEach(el => {
                el.classList.toggle('field-hidden', !visible);
            });
        }
    }
}

function collectDisplaySettingsFromUI() {
    const settings = getDefaultDisplaySettings();
    document.querySelectorAll('[data-display-key]').forEach(checkbox => {
        const path = checkbox.dataset.displayKey.split('.');
        if (path.length === 2) {
            settings[path[0]][path[1]] = checkbox.checked;
        } else if (path.length === 3) {
            settings[path[0]][path[1]][path[2]] = checkbox.checked;
        }
    });
    return settings;
}

async function initDisplaySettings() {
    const settings = await loadDisplaySettings();

    // UIチェックボックスに反映
    document.querySelectorAll('[data-display-key]').forEach(checkbox => {
        const path = checkbox.dataset.displayKey.split('.');
        let value = settings;
        for (const key of path) {
            value = value && value[key];
        }
        checkbox.checked = value !== false;
    });

    applyDisplaySettings(settings);

    // changeイベントで自動保存
    document.querySelectorAll('[data-display-key]').forEach(checkbox => {
        checkbox.addEventListener('change', async () => {
            const newSettings = collectDisplaySettingsFromUI();
            await saveDisplaySettings(newSettings);
            applyDisplaySettings(newSettings);
        });
    });
}

// ============================================================
// 10. initApp() - メイン初期化
// ============================================================

/**
 * アプリ初期化
 */
async function initApp() {
    initVersionInfo();
    initScrollToTop();
    initUpdateBanner();
    initTabs();
    initSelectOnFocus();
    initPatientSearch();
    initLabFilter();
    initHistoryControls();
    initVitalsChartControls();
    initAISettings();
    initAIDiagnosis();
    updateAITabVisibility();
    await initDisplaySettings();

    // フォームハンドラのセットアップ
    document.getElementById('save-record-btn').addEventListener('click', saveRecord);
    document.getElementById('save-prescription-btn').addEventListener('click', savePrescription);
    document.getElementById('save-lab-btn').addEventListener('click', saveLabResult);
    document.getElementById('add-patient-btn').addEventListener('click', () => openPatientForm());
    document.getElementById('patient-form').addEventListener('submit', savePatient);
    document.getElementById('patient-form-cancel').addEventListener('click', () => {
        document.getElementById('patient-form-overlay').classList.remove('show');
    });
    document.getElementById('add-allergy-btn').addEventListener('click', () => addAllergyRow());
    document.getElementById('add-history-btn').addEventListener('click', () => addHistoryRow());
    document.getElementById('edit-record-form').addEventListener('submit', saveEditRecord);
    document.getElementById('edit-record-cancel').addEventListener('click', () => {
        document.getElementById('edit-record-overlay').classList.remove('show');
    });
    document.getElementById('edit-prescription-form').addEventListener('submit', saveEditPrescription);
    document.getElementById('edit-prescription-cancel').addEventListener('click', () => {
        document.getElementById('edit-prescription-overlay').classList.remove('show');
    });
    document.getElementById('edit-lab-form').addEventListener('submit', saveEditLabResult);
    document.getElementById('edit-lab-cancel').addEventListener('click', () => {
        document.getElementById('edit-lab-overlay').classList.remove('show');
    });

    // 設定
    document.getElementById('export-btn').addEventListener('click', exportData);
    document.getElementById('import-file').addEventListener('change', importData);
    document.getElementById('delete-all-btn').addEventListener('click', deleteAllData);
    document.getElementById('confirm-cancel').addEventListener('click', () => {
        document.getElementById('confirm-overlay').classList.remove('show');
    });

    // メディア添付エリア初期化
    initMediaAttachArea(document.getElementById('record-media-area'), 'record');
    initMediaAttachArea(document.getElementById('lab-media-area'), 'lab_result');
    initMediaAttachArea(document.getElementById('patient-media-area'), 'patient');

    handleTabFromUrl();
    await loadPatients();
    await registerServiceWorker();
    await updateAppBadge();
    document.body.dataset.appReady = 'true';
}

document.addEventListener('DOMContentLoaded', initApp);

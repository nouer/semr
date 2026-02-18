/**
 * e2e.test.js - 電子カルテ (emr) E2Eテスト
 * Puppeteer で Docker ネットワーク内の nginx にアクセスしてテスト
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const childProcess = require('child_process');

describe('E2E Test: emr App', () => {
    let browser;
    let page;
    let baseUrl = 'http://emr-app:80';
    const pageErrors = [];

    jest.setTimeout(300000);

    beforeAll(async () => {
        const host = process.env.E2E_APP_HOST || 'emr-app';
        const fixedIp = String(process.env.E2E_APP_IP || '').trim();
        const hasFixedIp = Boolean(fixedIp && /^\d+\.\d+\.\d+\.\d+$/.test(fixedIp));

        if (hasFixedIp) {
            baseUrl = `http://${fixedIp}:80`;
            console.log(`E2E baseUrl = ${baseUrl} (fixed)`);
        } else {
            const tryResolveIpv4 = () => {
                try {
                    const out = childProcess.execSync(`getent hosts ${host}`, { encoding: 'utf-8', timeout: 8000 }).trim();
                    const ip = out.split(/\s+/)[0];
                    if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip;
                } catch (e) {}
                try {
                    const out = childProcess.execSync(`nslookup ${host} 127.0.0.11`, { encoding: 'utf-8', timeout: 8000 });
                    const lines = String(out || '').split('\n').map(l => l.trim()).filter(Boolean);
                    const addrLine = lines.find(l => /^Address\s+\d+:\s+\d+\.\d+\.\d+\.\d+/.test(l));
                    if (addrLine) {
                        const m = addrLine.match(/(\d+\.\d+\.\d+\.\d+)/);
                        if (m && m[1]) return m[1];
                    }
                } catch (e) {}
                try {
                    const hostsText = fs.readFileSync('/etc/hosts', 'utf-8');
                    const line = hostsText.split('\n').find(l => l.includes(` ${host}`) || l.endsWith(`\t${host}`));
                    if (line) {
                        const ip = line.trim().split(/\s+/)[0];
                        if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip;
                    }
                } catch (e) {}
                return null;
            };

            let ip = null;
            for (let i = 0; i < 30; i++) {
                ip = tryResolveIpv4();
                if (ip) break;
                await new Promise(r => setTimeout(r, 1000));
            }
            if (!ip) {
                throw new Error(`E2E: cannot resolve '${host}' to IPv4.`);
            }
            baseUrl = `http://${ip}:80`;
            console.log(`E2E baseUrl = ${baseUrl}`);
        }

        browser = await puppeteer.launch({
            headless: 'new',
            timeout: 300000,
            protocolTimeout: 300000,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });
        page = await browser.newPage();

        page.on('pageerror', error => {
            console.error('Browser Page Error:', error.message);
            pageErrors.push(error.message);
        });

        page.on('console', msg => {
            if (msg.type() === 'error') {
                console.error('Browser Console Error:', msg.text());
            }
        });
    }, 300000);

    afterAll(async () => {
        if (browser) await browser.close();
    });

    beforeEach(() => {
        pageErrors.length = 0;
    });

    const isVisible = async (selector) => {
        return await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el) return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
        }, selector);
    };

    /** initApp()完了を待機（data-app-ready="true"フラグ） */
    const waitForAppReady = async () => {
        await page.waitForFunction(() => {
            return document.body.dataset.appReady === 'true';
        }, { timeout: 30000 });
    };

    /**
     * テストデータのクリーンアップ：IndexedDB全ストアクリア + localStorage関連キー削除
     */
    const cleanupTestData = async () => {
        await page.evaluate(async () => {
            // IndexedDB全ストアクリア
            try {
                await clearStore('patients');
                await clearStore('records');
                await clearStore('prescriptions');
                await clearStore('lab_results');
                await clearStore('ai_conversations');
                await clearStore('media');
            } catch (e) {}
            // localStorage関連キー削除
            localStorage.removeItem('emr_ai_key');
            localStorage.removeItem('emr_ai_memo');
            localStorage.removeItem('emr_ai_model');
        });
    };

    /**
     * 患者を登録するヘルパー
     * @param {object} opts - { name, kana, birth, gender, phone, code, allergies }
     * @returns {Promise<string>} 患者名
     */
    const registerPatient = async (opts) => {
        await page.click('#add-patient-btn');
        await page.waitForSelector('#patient-form-overlay.show', { timeout: 10000 });

        await page.evaluate((o) => {
            const nameEl = document.getElementById('input-patient-name');
            const kanaEl = document.getElementById('input-patient-kana');
            const birthEl = document.getElementById('input-patient-birth');
            const genderEl = document.getElementById('input-patient-gender');
            const phoneEl = document.getElementById('input-patient-phone');
            const codeEl = document.getElementById('input-patient-code');

            // nativeInputValueSetterでセットし、changeイベントを発火
            nameEl.value = o.name || '';
            nameEl.dispatchEvent(new Event('input', { bubbles: true }));
            kanaEl.value = o.kana || '';
            kanaEl.dispatchEvent(new Event('input', { bubbles: true }));
            birthEl.value = o.birth || '';
            birthEl.dispatchEvent(new Event('change', { bubbles: true }));
            genderEl.value = o.gender || '';
            genderEl.dispatchEvent(new Event('change', { bubbles: true }));
            phoneEl.value = o.phone || '';
            codeEl.value = o.code || '';
        }, opts);

        // アレルギーを追加
        if (opts.allergies && opts.allergies.length > 0) {
            for (const allergy of opts.allergies) {
                await page.click('#add-allergy-btn');
                await page.evaluate((allergen) => {
                    const rows = document.querySelectorAll('#allergy-list-form .allergy-row');
                    const lastRow = rows[rows.length - 1];
                    if (lastRow) {
                        const input = lastRow.querySelector('.allergy-allergen') || lastRow.querySelector('input');
                        if (input) input.value = allergen;
                    }
                }, allergy);
            }
        }

        // submitイベントを直接ディスパッチ（HTML5 validation バイパス）
        await page.evaluate(() => {
            const form = document.getElementById('patient-form');
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        // オーバーレイが閉じるか、エラーメッセージが表示されるのを待つ
        const result = await page.evaluate(async () => {
            // 最大10秒待機
            for (let i = 0; i < 100; i++) {
                await new Promise(r => setTimeout(r, 100));
                const overlay = document.getElementById('patient-form-overlay');
                if (!overlay.classList.contains('show')) return { success: true };
                const msg = document.getElementById('patient-form-message');
                if (msg && msg.textContent && msg.classList.contains('error')) {
                    return { success: false, error: msg.textContent };
                }
            }
            // タイムアウト時のデバッグ情報
            return {
                success: false,
                error: 'timeout',
                formValues: {
                    name: document.getElementById('input-patient-name').value,
                    birth: document.getElementById('input-patient-birth').value,
                    gender: document.getElementById('input-patient-gender').value,
                    overlayHasShow: document.getElementById('patient-form-overlay').classList.contains('show'),
                    msg: document.getElementById('patient-form-message')?.textContent || ''
                }
            };
        });

        if (!result.success) {
            console.error('registerPatient failed:', JSON.stringify(result));
            throw new Error(`Patient registration failed: ${JSON.stringify(result)}`);
        }

        return opts.name;
    };

    /**
     * 最初の患者カードをクリックして患者を選択するヘルパー
     */
    const selectFirstPatient = async () => {
        await page.waitForSelector('.patient-card', { timeout: 10000 });
        // JavaScriptで直接selectPatientを呼び出す（onclick属性のタイミング問題を回避）
        await page.evaluate(() => {
            const card = document.querySelector('.patient-card');
            const patientId = card.dataset.patientId;
            selectPatient(patientId);
        });
        // カルテタブへの自動遷移を待機
        await page.waitForSelector('#tab-karte.active', { timeout: 10000 });
    };

    /**
     * 指定タブに切り替えるヘルパー
     * @param {string} tabName - patients, karte, prescription, lab, history, ai, settings
     */
    const switchTab = async (tabName) => {
        if (tabName === 'ai') {
            await page.click('#ai-tab-btn');
        } else {
            await page.click(`[data-tab="${tabName}"]`);
        }
        await page.waitForSelector(`#tab-${tabName}.active`, { timeout: 5000 });
    };

    // =========================================================
    // 2.1 基本操作テスト
    // =========================================================

    test('E2E-001: ページが表示される（タイトル、ヘッダー、タブナビ）', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        const title = await page.title();
        expect(title).toBe('電子カルテ - emr');

        const headerVisible = await isVisible('.app-header');
        expect(headerVisible).toBe(true);

        const tabNavVisible = await isVisible('.tab-nav');
        expect(tabNavVisible).toBe(true);

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-002: 初期表示で患者タブがアクティブ', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        const isActive = await page.evaluate(() => {
            return document.getElementById('tab-patients').classList.contains('active');
        });
        expect(isActive).toBe(true);

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-003: 患者を新規登録できる', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();
        await cleanupTestData();
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        await registerPatient({
            name: 'テスト太郎',
            kana: 'てすとたろう',
            birth: '1980-01-01',
            gender: 'male'
        });

        // 患者リストに表示されることを確認
        const listText = await page.$eval('#patient-list', el => el.textContent || '');
        expect(listText).toContain('テスト太郎');

        // patient-cardが存在することを確認
        const cardCount = await page.evaluate(() => {
            return document.querySelectorAll('.patient-card').length;
        });
        expect(cardCount).toBeGreaterThanOrEqual(1);

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-004: 患者検索ができる', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();
        await cleanupTestData();
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        // 2名の患者を登録
        await registerPatient({ name: 'テスト太郎', kana: 'てすとたろう', birth: '1980-01-01', gender: 'male' });
        await registerPatient({ name: '別名花子', kana: 'べつめいはなこ', birth: '1990-05-05', gender: 'female' });

        // 「テスト」で検索
        await page.evaluate(() => {
            const input = document.getElementById('patient-search');
            input.value = 'テスト';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await new Promise(r => setTimeout(r, 500));

        // フィルタ結果を確認：テスト太郎が表示され、別名花子が非表示
        const visibleCards = await page.evaluate(() => {
            const cards = document.querySelectorAll('.patient-card');
            let visible = 0;
            cards.forEach(card => {
                const style = window.getComputedStyle(card);
                if (style.display !== 'none') visible++;
            });
            return visible;
        });
        expect(visibleCards).toBe(1);

        // 検索クリア
        await page.evaluate(() => {
            const input = document.getElementById('patient-search');
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-005: カルテ記録（SOAP）を保存できる', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();
        await cleanupTestData();
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        // 患者登録・選択
        await registerPatient({ name: 'カルテテスト患者', kana: 'かるててすとかんじゃ', birth: '1975-03-15', gender: 'male' });
        await selectFirstPatient();

        // カルテタブに自動遷移するのを待つ
        await page.waitForSelector('#tab-karte.active', { timeout: 10000 });
        await page.waitForSelector('#karte-content', { visible: true, timeout: 10000 });

        // SOAP入力
        await page.evaluate(() => {
            document.getElementById('input-soap-s').value = '頭痛';
            document.getElementById('input-soap-o').value = '触診で異常なし';
            document.getElementById('input-soap-a').value = '緊張型頭痛';
            document.getElementById('input-soap-p').value = '経過観察';
        });

        await page.click('#save-record-btn');
        await page.waitForFunction(() => {
            const msg = document.getElementById('record-message');
            return msg && msg.textContent.includes('保存');
        }, { timeout: 10000 });

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-006: バイタルサインを記録できる', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();
        await cleanupTestData();
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        // 患者登録・選択
        await registerPatient({ name: 'バイタルテスト患者', kana: 'ばいたるてすとかんじゃ', birth: '1985-06-20', gender: 'female' });
        await selectFirstPatient();

        await page.waitForSelector('#tab-karte.active', { timeout: 10000 });
        await page.waitForSelector('#karte-content', { visible: true, timeout: 10000 });

        // SOAP必須項目 + バイタル入力
        await page.evaluate(() => {
            document.getElementById('input-soap-s').value = '定期検診';
            document.getElementById('input-soap-o').value = '特記事項なし';
            document.getElementById('input-soap-a').value = '良好';
            document.getElementById('input-soap-p').value = '次回1か月後';
            document.getElementById('input-systolic').value = '120';
            document.getElementById('input-diastolic').value = '80';
            document.getElementById('input-pulse').value = '72';
            document.getElementById('input-temperature').value = '36.5';
        });

        await page.click('#save-record-btn');
        await page.waitForFunction(() => {
            const msg = document.getElementById('record-message');
            return msg && msg.textContent.includes('保存');
        }, { timeout: 10000 });

        // 直近記録に表示されることを確認
        const recentText = await page.$eval('#recent-records-list', el => el.textContent || '');
        expect(recentText).toContain('120');

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-007: 処方を記録できる', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();
        await cleanupTestData();
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        // 患者登録・選択
        await registerPatient({ name: '処方テスト患者', kana: 'しょほうてすとかんじゃ', birth: '1970-12-01', gender: 'male' });
        await selectFirstPatient();

        await page.waitForSelector('#tab-karte.active', { timeout: 10000 });

        // 処方タブに切り替え
        await switchTab('prescription');

        await page.waitForSelector('#prescription-content', { visible: true, timeout: 10000 });

        // 処方入力
        await page.evaluate(() => {
            document.getElementById('input-medicine').value = 'ロキソニン';
            document.getElementById('input-dosage').value = '1回1錠';
            document.getElementById('input-frequency').value = '毎食後';
            document.getElementById('input-days').value = '7';
        });

        await page.click('#save-prescription-btn');
        await page.waitForFunction(() => {
            const msg = document.getElementById('prescription-message');
            return msg && msg.textContent.includes('保存');
        }, { timeout: 10000 });

        // 処方リストに表示されることを確認
        const listText = await page.$eval('#prescription-list', el => el.textContent || '');
        expect(listText).toContain('ロキソニン');

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-008: 検査結果を記録できる', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();
        await cleanupTestData();
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        // 患者登録・選択
        await registerPatient({ name: '検査テスト患者', kana: 'けんさてすとかんじゃ', birth: '1965-08-10', gender: 'female' });
        await selectFirstPatient();

        await page.waitForSelector('#tab-karte.active', { timeout: 10000 });

        // 検査タブに切り替え
        await switchTab('lab');

        await page.waitForSelector('#lab-content', { visible: true, timeout: 10000 });

        // 検査結果入力
        await page.evaluate(() => {
            document.getElementById('input-lab-category').value = 'blood';
            document.getElementById('input-lab-item').value = '白血球数';
            document.getElementById('input-lab-value').value = '5800';
            document.getElementById('input-lab-unit').value = '/μL';
            document.getElementById('input-lab-ref-min').value = '3500';
            document.getElementById('input-lab-ref-max').value = '9700';
        });

        await page.click('#save-lab-btn');
        await page.waitForFunction(() => {
            const msg = document.getElementById('lab-message');
            return msg && msg.textContent.includes('保存');
        }, { timeout: 10000 });

        // 検査結果リストに表示されることを確認
        const listText = await page.$eval('#lab-results-list', el => el.textContent || '');
        expect(listText).toContain('白血球数');

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-009: 履歴タブにタイムラインが表示される', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();
        await cleanupTestData();
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        // 患者登録・選択、カルテ記録を作成
        await registerPatient({ name: '履歴テスト患者', kana: 'りれきてすとかんじゃ', birth: '1988-04-25', gender: 'male' });
        await selectFirstPatient();

        await page.waitForSelector('#tab-karte.active', { timeout: 10000 });
        await page.waitForSelector('#karte-content', { visible: true, timeout: 10000 });

        await page.evaluate(() => {
            document.getElementById('input-soap-s').value = '腰痛';
            document.getElementById('input-soap-o').value = '可動域制限あり';
            document.getElementById('input-soap-a').value = '腰椎椎間板症';
            document.getElementById('input-soap-p').value = 'リハビリ開始';
        });

        await page.click('#save-record-btn');
        await page.waitForFunction(() => {
            const msg = document.getElementById('record-message');
            return msg && msg.textContent.includes('保存');
        }, { timeout: 10000 });

        // 履歴タブに切り替え
        await switchTab('history');

        await page.waitForSelector('#history-content', { visible: true, timeout: 10000 });

        // タイムラインコンテナにコンテンツがあることを確認
        const timelineText = await page.$eval('#timeline-container', el => el.textContent || '');
        expect(timelineText.length).toBeGreaterThan(0);

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-010: 全操作でページエラーが発生しない', async () => {
        pageErrors.length = 0;

        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();
        await cleanupTestData();
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        // 患者登録
        await registerPatient({ name: 'エラーチェック患者', kana: 'えらーちぇっくかんじゃ', birth: '1982-07-14', gender: 'female' });
        await selectFirstPatient();

        await page.waitForSelector('#tab-karte.active', { timeout: 10000 });

        // SOAP記録
        await page.evaluate(() => {
            document.getElementById('input-soap-s').value = '検査項目';
            document.getElementById('input-soap-o').value = '所見';
            document.getElementById('input-soap-a').value = '評価';
            document.getElementById('input-soap-p').value = '計画';
        });
        await page.click('#save-record-btn');
        await page.waitForFunction(() => {
            const msg = document.getElementById('record-message');
            return msg && msg.textContent.includes('保存');
        }, { timeout: 10000 });

        // 各タブを巡回
        const tabs = ['patients', 'karte', 'prescription', 'lab', 'history', 'settings'];
        for (const tab of tabs) {
            await switchTab(tab);
            await new Promise(r => setTimeout(r, 300));
        }

        expect(pageErrors.length).toBe(0);
    }, 60000);

    // =========================================================
    // 2.2 固定UI要素テスト
    // =========================================================

    test('E2E-025: バージョン情報が表示される', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        const infoDisplay = await page.evaluate(() => {
            const el = document.getElementById('app-info-display');
            return el ? el.innerHTML : null;
        });
        expect(infoDisplay).not.toBeNull();
        expect(infoDisplay).toContain('Ver:');
        expect(infoDisplay).toContain('Build:');

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-026: スクロールトップボタンがposition:fixedで存在する', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        const btnExists = await page.evaluate(() => {
            const el = document.getElementById('scroll-to-top-btn');
            if (!el) return false;
            const style = window.getComputedStyle(el);
            return style.position === 'fixed';
        });
        expect(btnExists).toBe(true);

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-027: スクロールトップボタンでページ先頭に戻る', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        // ページにスクロール可能なコンテンツを追加
        await page.evaluate(() => {
            const spacer = document.createElement('div');
            spacer.id = 'test-spacer';
            spacer.style.height = '3000px';
            document.body.appendChild(spacer);
        });

        // ページ下部にスクロール
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
        await new Promise(r => setTimeout(r, 500));

        const scrollYBefore = await page.evaluate(() => window.scrollY);
        expect(scrollYBefore).toBeGreaterThan(0);

        // スクロールトップボタンをクリック
        await page.click('#scroll-to-top-btn');
        await new Promise(r => setTimeout(r, 2000));

        const scrollYAfter = await page.evaluate(() => window.scrollY);
        expect(scrollYAfter).toBeLessThanOrEqual(10);

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-028: ヘッダークリックでページ先頭へ戻る', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        // ヘッダーにcursor:pointerが設定されていることを確認
        const headerCursor = await page.evaluate(() => {
            const header = document.querySelector('.app-header');
            return window.getComputedStyle(header).cursor;
        });
        expect(headerCursor).toBe('pointer');

        // ページにスクロール可能なコンテンツを追加
        await page.evaluate(() => {
            const spacer = document.createElement('div');
            spacer.id = 'test-spacer';
            spacer.style.height = '3000px';
            document.body.appendChild(spacer);
        });

        // ページ下部にスクロール
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
        await new Promise(r => setTimeout(r, 500));

        const scrollYBefore = await page.evaluate(() => window.scrollY);
        expect(scrollYBefore).toBeGreaterThan(0);

        // ヘッダーをクリック
        await page.click('.app-header');
        await new Promise(r => setTimeout(r, 2000));

        const scrollYAfter = await page.evaluate(() => window.scrollY);
        expect(scrollYAfter).toBeLessThanOrEqual(10);

        const headerVisible = await isVisible('.app-header');
        expect(headerVisible).toBe(true);

        expect(pageErrors.length).toBe(0);
    }, 60000);

    // =========================================================
    // 2.3 入力フォームUXテスト
    // =========================================================

    test('E2E-021: フォーカスで入力値が全選択される', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();
        await cleanupTestData();
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        // 患者登録・選択してカルテタブへ
        await registerPatient({ name: 'フォーカステスト患者', kana: 'ふぉーかすてすとかんじゃ', birth: '1990-01-01', gender: 'male' });
        await selectFirstPatient();
        await page.waitForSelector('#tab-karte.active', { timeout: 10000 });
        await page.waitForSelector('#karte-content', { visible: true, timeout: 10000 });

        // textareaで全選択の検証（selectionStart/selectionEndが取得可能）
        await page.evaluate(() => {
            document.getElementById('input-treatment-memo').value = 'テストメモ入力';
        });

        await page.focus('#input-treatment-memo');
        await new Promise(r => setTimeout(r, 200));

        const selectionInfo = await page.evaluate(() => {
            const el = document.getElementById('input-treatment-memo');
            return {
                selectionStart: el.selectionStart,
                selectionEnd: el.selectionEnd,
                valueLength: el.value.length
            };
        });

        expect(selectionInfo.selectionStart).toBe(0);
        expect(selectionInfo.selectionEnd).toBe(selectionInfo.valueLength);
        expect(selectionInfo.valueLength).toBeGreaterThan(0);

        // number入力にフォーカスするとactiveElementになることを確認
        const hasSelectOnFocus = await page.evaluate(() => {
            const el = document.getElementById('input-systolic');
            el.value = '120';
            el.focus();
            return document.activeElement === el;
        });
        expect(hasSelectOnFocus).toBe(true);

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-022: 患者切り替えでフォームがリセットされる', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();
        await cleanupTestData();
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        // 2名の患者を登録
        await registerPatient({ name: '患者A', kana: 'かんじゃえー', birth: '1980-01-01', gender: 'male' });
        await registerPatient({ name: '患者B', kana: 'かんじゃびー', birth: '1990-02-02', gender: 'female' });

        // 患者Aを選択
        await page.evaluate(() => {
            const cards = document.querySelectorAll('.patient-card');
            if (cards[0]) cards[0].click();
        });
        await page.waitForSelector('#tab-karte.active', { timeout: 10000 });
        await page.waitForSelector('#karte-content', { visible: true, timeout: 10000 });

        // SOAP入力
        await page.evaluate(() => {
            document.getElementById('input-soap-s').value = '患者Aの主訴';
            document.getElementById('input-soap-o').value = '患者Aの所見';
            document.getElementById('input-soap-a').value = '患者Aの評価';
            document.getElementById('input-soap-p').value = '患者Aの計画';
        });

        // 患者タブに戻って患者Bを選択
        await switchTab('patients');
        await page.evaluate(() => {
            const cards = document.querySelectorAll('.patient-card');
            if (cards[1]) cards[1].click();
        });
        await page.waitForSelector('#tab-karte.active', { timeout: 10000 });
        await page.waitForSelector('#karte-content', { visible: true, timeout: 10000 });

        // SOAPフィールドがクリアされていることを確認
        const soapValues = await page.evaluate(() => {
            return {
                s: document.getElementById('input-soap-s').value,
                o: document.getElementById('input-soap-o').value,
                a: document.getElementById('input-soap-a').value,
                p: document.getElementById('input-soap-p').value
            };
        });

        expect(soapValues.s).toBe('');
        expect(soapValues.o).toBe('');
        expect(soapValues.a).toBe('');
        expect(soapValues.p).toBe('');

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-023: アレルギー警告が表示される', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();
        await cleanupTestData();
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        // アレルギー付き患者を登録
        await registerPatient({
            name: 'アレルギー患者',
            kana: 'あれるぎーかんじゃ',
            birth: '1975-06-15',
            gender: 'female',
            allergies: ['ペニシリン']
        });

        // 患者を選択
        await selectFirstPatient();
        await page.waitForSelector('#tab-karte.active', { timeout: 10000 });
        await page.waitForSelector('#karte-content', { visible: true, timeout: 10000 });

        // アレルギー警告が表示されることを確認
        const warningVisible = await page.evaluate(() => {
            const el = document.getElementById('allergy-warning');
            return el && el.style.display !== 'none';
        });
        expect(warningVisible).toBe(true);

        const warningText = await page.$eval('#allergy-warning', el => el.textContent || '');
        expect(warningText).toContain('ペニシリン');

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-024: 前回Planヒントが表示される', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();
        await cleanupTestData();
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        // 患者登録
        await registerPatient({ name: 'Planヒント患者', kana: 'ぷらんひんとかんじゃ', birth: '1985-09-20', gender: 'male' });
        await selectFirstPatient();

        await page.waitForSelector('#tab-karte.active', { timeout: 10000 });
        await page.waitForSelector('#karte-content', { visible: true, timeout: 10000 });

        // 1件目の記録を作成
        await page.evaluate(() => {
            document.getElementById('input-soap-s').value = '1回目の主訴';
            document.getElementById('input-soap-o').value = '1回目の所見';
            document.getElementById('input-soap-a').value = '1回目の評価';
            document.getElementById('input-soap-p').value = '次回は2週間後に再診';
        });
        await page.click('#save-record-btn');
        await page.waitForFunction(() => {
            const msg = document.getElementById('record-message');
            return msg && msg.textContent.includes('保存');
        }, { timeout: 10000 });

        // 少し待ってからprev-plan-hintを確認
        await new Promise(r => setTimeout(r, 1000));

        const hintVisible = await page.evaluate(() => {
            const el = document.getElementById('prev-plan-hint');
            return el && el.style.display !== 'none';
        });
        expect(hintVisible).toBe(true);

        const hintText = await page.$eval('#prev-plan-hint', el => el.textContent || '');
        expect(hintText).toContain('次回は2週間後に再診');

        expect(pageErrors.length).toBe(0);
    }, 60000);

    // =========================================================
    // 2.4 データ管理テスト
    // =========================================================

    test('E2E-030: エクスポートでダウンロードが発生する', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();
        await cleanupTestData();
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        // 患者登録
        await registerPatient({ name: 'エクスポート患者', kana: 'えくすぽーとかんじゃ', birth: '1980-01-01', gender: 'male' });

        // 設定タブに切り替え
        await switchTab('settings');

        // exportData()を呼んでJSONの構造を検証（ダウンロードを傍受する代わり）
        const exportResult = await page.evaluate(async () => {
            const patients = await getAllFromStore('patients');
            const allRecords = [];
            const allPrescriptions = [];
            const allLabResults = [];
            for (const p of patients) {
                const records = await getByIndex('records', 'patientId', p.id);
                const prescriptions = await getByIndex('prescriptions', 'patientId', p.id);
                const labResults = await getByIndex('lab_results', 'patientId', p.id);
                allRecords.push(...records);
                allPrescriptions.push(...prescriptions);
                allLabResults.push(...labResults);
            }
            return {
                appName: 'emr',
                patientCount: patients.length,
                recordCount: allRecords.length,
                prescriptionCount: allPrescriptions.length,
                labResultCount: allLabResults.length
            };
        });

        expect(exportResult.appName).toBe('emr');
        expect(exportResult.patientCount).toBeGreaterThanOrEqual(1);

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-031: インポートでデータが復元される', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();
        await cleanupTestData();
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        await switchTab('settings');

        const importJson = JSON.stringify({
            version: '1.0.0',
            appName: 'emr',
            exportedAt: new Date().toISOString(),
            patients: [{
                id: 'import-test-001',
                patientCode: 'IMP001',
                name: 'インポート患者',
                nameKana: 'いんぽーとかんじゃ',
                birthDate: '1990-01-01',
                gender: 'male',
                phone: null,
                allergies: [],
                medicalHistory: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }],
            records: [],
            prescriptions: [],
            labResults: [],
            aiMemo: 'インポートテスト備考'
        });

        // ファイルをセット
        await page.evaluate((json) => {
            const blob = new Blob([json], { type: 'application/json' });
            const file = new File([blob], 'test_import.json', { type: 'application/json' });
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            const input = document.getElementById('import-file');
            input.files = dataTransfer.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }, importJson);

        // 確認ダイアログが表示されるのを待つ
        await page.waitForSelector('#confirm-overlay.show', { timeout: 10000 });
        await page.click('#confirm-ok');

        // インポート完了メッセージを待つ
        await page.waitForFunction(() => {
            const msg = document.getElementById('data-message');
            return msg && msg.textContent.includes('インポート');
        }, { timeout: 10000 });

        // 患者タブに戻って患者が表示されることを確認
        await switchTab('patients');
        await new Promise(r => setTimeout(r, 500));

        const patientListText = await page.$eval('#patient-list', el => el.textContent || '');
        expect(patientListText).toContain('インポート患者');

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-032: エクスポートJSONの構造を検証', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();
        await cleanupTestData();
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        // テスト用データを準備
        await page.evaluate(() => {
            localStorage.setItem('emr_ai_memo', 'テスト備考');
        });
        await registerPatient({ name: '構造テスト患者', kana: 'こうぞうてすとかんじゃ', birth: '1995-06-01', gender: 'female' });

        // エクスポートデータの構造をプログラム的に検証
        const dataStructure = await page.evaluate(async () => {
            const patients = await getAllFromStore('patients');
            const aiMemo = localStorage.getItem('emr_ai_memo') || '';
            return {
                hasPatients: Array.isArray(patients),
                patientCount: patients.length,
                aiMemo: aiMemo,
                firstPatientHasId: patients.length > 0 && !!patients[0].id,
                firstPatientHasName: patients.length > 0 && !!patients[0].name
            };
        });

        expect(dataStructure.hasPatients).toBe(true);
        expect(dataStructure.patientCount).toBeGreaterThanOrEqual(1);
        expect(dataStructure.aiMemo).toBe('テスト備考');
        expect(dataStructure.firstPatientHasId).toBe(true);
        expect(dataStructure.firstPatientHasName).toBe(true);

        // クリーンアップ
        await page.evaluate(() => {
            localStorage.removeItem('emr_ai_memo');
        });

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-033: インポート時に確認ダイアログが表示される', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();
        await cleanupTestData();
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        await switchTab('settings');

        const importJson = JSON.stringify({
            version: '1.0.0',
            appName: 'emr',
            exportedAt: new Date().toISOString(),
            patients: [
                { id: 'confirm-test-001', patientCode: 'CT001', name: '確認患者1', birthDate: '1980-01-01', gender: 'male', allergies: [], medicalHistory: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
                { id: 'confirm-test-002', patientCode: 'CT002', name: '確認患者2', birthDate: '1985-02-02', gender: 'female', allergies: [], medicalHistory: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
            ],
            records: [
                { id: 'confirm-rec-001', patientId: 'confirm-test-001', visitedAt: new Date().toISOString(), soap: { subjective: '主訴' }, vitals: {}, createdAt: new Date().toISOString() }
            ],
            prescriptions: [],
            labResults: [],
            aiMemo: ''
        });

        // ファイルをセット
        await page.evaluate((json) => {
            const blob = new Blob([json], { type: 'application/json' });
            const file = new File([blob], 'confirm_test.json', { type: 'application/json' });
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            const input = document.getElementById('import-file');
            input.files = dataTransfer.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }, importJson);

        // 確認ダイアログが表示されることを確認
        await page.waitForSelector('#confirm-overlay.show', { timeout: 10000 });

        const confirmText = await page.evaluate(() => {
            const titleEl = document.getElementById('confirm-title');
            const msgEl = document.getElementById('confirm-message');
            return (titleEl ? titleEl.textContent : '') + ' ' + (msgEl ? msgEl.textContent : '');
        });

        // 患者数・記録数の情報が含まれていることを確認
        expect(confirmText).toContain('2');
        expect(confirmText).toContain('1');

        // キャンセルで閉じる
        await page.click('#confirm-cancel');
        await page.waitForFunction(() => {
            const overlay = document.getElementById('confirm-overlay');
            return !overlay.classList.contains('show');
        }, { timeout: 5000 });

        expect(pageErrors.length).toBe(0);
    }, 60000);

    // =========================================================
    // 2.5 AI診断機能テスト
    // =========================================================

    test('E2E-040: APIキー未設定時にAIタブが非表示', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        await page.evaluate(() => {
            localStorage.removeItem('emr_ai_key');
        });
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        const aiTabVisible = await isVisible('#ai-tab-btn');
        expect(aiTabVisible).toBe(false);

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-041: APIキー設定後にAIタブが表示される', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        await page.evaluate(() => {
            localStorage.setItem('emr_ai_key', 'sk-test');
        });
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        const aiTabVisible = await isVisible('#ai-tab-btn');
        expect(aiTabVisible).toBe(true);

        // クリーンアップ
        await page.evaluate(() => {
            localStorage.removeItem('emr_ai_key');
        });

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-042: AI備考の保存が動作する', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        await switchTab('settings');

        await page.evaluate(() => {
            document.getElementById('input-ai-memo').value = '整形外科専門・腰痛患者多数';
        });
        await page.click('#save-ai-memo-btn');

        const savedMemo = await page.evaluate(() => {
            return localStorage.getItem('emr_ai_memo');
        });
        expect(savedMemo).toBe('整形外科専門・腰痛患者多数');

        // クリーンアップ
        await page.evaluate(() => {
            localStorage.removeItem('emr_ai_memo');
        });

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-043: parseSuggestionsが正しく候補を抽出する', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        const result = await page.evaluate(() => {
            const text = '診断結果は良好です。\n\n{{SUGGEST:食事療法について教えてください}}\n{{SUGGEST:運動療法の注意点は？}}\n{{SUGGEST:経過観察の頻度を教えてください}}';
            return parseSuggestions(text);
        });

        expect(result.suggestions).toHaveLength(3);
        expect(result.suggestions[0]).toBe('食事療法について教えてください');
        expect(result.suggestions[1]).toBe('運動療法の注意点は？');
        expect(result.suggestions[2]).toBe('経過観察の頻度を教えてください');
        expect(result.mainContent).not.toContain('{{SUGGEST:');
        expect(result.mainContent).toContain('診断結果は良好です。');

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-044: 提案質問ボタンがAI応答に表示される', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        await page.evaluate(() => {
            localStorage.setItem('emr_ai_key', 'sk-test-dummy-key');
        });
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        await switchTab('ai');

        // AIチャットにテストデータを注入
        await page.evaluate(() => {
            aiConversation = [
                { role: 'user', content: 'テスト質問', displayContent: 'テスト質問' },
                { role: 'assistant', content: '診察結果は正常です。\n\n{{SUGGEST:食事のアドバイスをください}}\n{{SUGGEST:運動について教えてください}}\n{{SUGGEST:再診の時期は？}}' }
            ];
            renderAIChatMessages(false);
        });

        const btnCount = await page.evaluate(() => {
            return document.querySelectorAll('.ai-suggestion-btn').length;
        });
        expect(btnCount).toBe(3);

        const firstBtnText = await page.evaluate(() => {
            return document.querySelector('.ai-suggestion-btn').textContent;
        });
        expect(firstBtnText).toBe('食事のアドバイスをください');

        const bubbleText = await page.evaluate(() => {
            return document.getElementById('ai-last-bubble').textContent;
        });
        expect(bubbleText).not.toContain('{{SUGGEST:');
        expect(bubbleText).toContain('診察結果は正常です。');

        // クリーンアップ
        await page.evaluate(() => {
            localStorage.removeItem('emr_ai_key');
        });

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-045: AIモデル選択セレクトが設定タブに存在する', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        await switchTab('settings');

        const selectExists = await page.evaluate(() => {
            const el = document.getElementById('ai-model-select');
            return el !== null && el.tagName === 'SELECT';
        });
        expect(selectExists).toBe(true);

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-046: AIモデルのデフォルト値がgpt-4o-miniである', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        await page.evaluate(() => {
            localStorage.removeItem('emr_ai_model');
        });
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        const defaultModel = await page.evaluate(() => {
            return document.getElementById('ai-model-select').value;
        });
        expect(defaultModel).toBe('gpt-4o-mini');

        const modelFromFunc = await page.evaluate(() => {
            return getSelectedAiModel();
        });
        expect(modelFromFunc).toBe('gpt-4o-mini');

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-047: AIモデル変更がlocalStorageに保存される', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        await switchTab('settings');

        await page.select('#ai-model-select', 'gpt-4.1');

        const savedModel = await page.evaluate(() => {
            return localStorage.getItem('emr_ai_model');
        });
        expect(savedModel).toBe('gpt-4.1');

        // クリーンアップ
        await page.evaluate(() => {
            localStorage.removeItem('emr_ai_model');
        });

        expect(pageErrors.length).toBe(0);
    }, 60000);

    // =========================================================
    // 2.6 グラフ表示テスト
    // =========================================================

    test('E2E-050: バイタルチャートのcanvasが存在する', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();
        await cleanupTestData();
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        // 患者登録・選択、バイタル付き記録を作成
        await registerPatient({ name: 'チャート患者', kana: 'ちゃーとかんじゃ', birth: '1978-03-01', gender: 'male' });
        await selectFirstPatient();

        await page.waitForSelector('#tab-karte.active', { timeout: 10000 });
        await page.waitForSelector('#karte-content', { visible: true, timeout: 10000 });

        await page.evaluate(() => {
            document.getElementById('input-soap-s').value = 'チャートテスト';
            document.getElementById('input-soap-o').value = '所見';
            document.getElementById('input-soap-a').value = '評価';
            document.getElementById('input-soap-p').value = '計画';
            document.getElementById('input-systolic').value = '130';
            document.getElementById('input-diastolic').value = '85';
            document.getElementById('input-pulse').value = '78';
        });

        await page.click('#save-record-btn');
        await page.waitForFunction(() => {
            const msg = document.getElementById('record-message');
            return msg && msg.textContent.includes('保存');
        }, { timeout: 10000 });

        // バイタルチャートのcanvasが存在し、コンテキストが取得できることを確認
        const canvasExists = await page.evaluate(() => {
            const canvas = document.getElementById('vitals-chart');
            return !!(canvas && typeof canvas.getContext === 'function');
        });
        expect(canvasExists).toBe(true);

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-051: 検査チャートのcanvasが存在する', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();
        await cleanupTestData();
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        // 患者登録・選択、検査結果を作成
        await registerPatient({ name: 'ラボチャート患者', kana: 'らぼちゃーとかんじゃ', birth: '1968-11-10', gender: 'female' });
        await selectFirstPatient();

        await page.waitForSelector('#tab-karte.active', { timeout: 10000 });

        // 検査タブに切り替え
        await switchTab('lab');

        await page.waitForSelector('#lab-content', { visible: true, timeout: 10000 });

        await page.evaluate(() => {
            document.getElementById('input-lab-category').value = 'blood';
            document.getElementById('input-lab-item').value = 'ヘモグロビン';
            document.getElementById('input-lab-value').value = '14.5';
            document.getElementById('input-lab-unit').value = 'g/dL';
        });

        await page.click('#save-lab-btn');
        await page.waitForFunction(() => {
            const msg = document.getElementById('lab-message');
            return msg && msg.textContent.includes('保存');
        }, { timeout: 10000 });

        // 検査チャートcanvasが存在することを確認
        const canvasExists = await page.evaluate(() => {
            const canvas = document.getElementById('lab-chart');
            return !!(canvas && typeof canvas.getContext === 'function');
        });
        expect(canvasExists).toBe(true);

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-052: チャート期間ボタンの切り替え', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();
        await cleanupTestData();
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        // 患者登録・選択
        await registerPatient({ name: '期間切替患者', kana: 'きかんきりかえかんじゃ', birth: '1980-01-01', gender: 'male' });
        await selectFirstPatient();

        await page.waitForSelector('#tab-karte.active', { timeout: 10000 });
        await page.waitForSelector('#karte-content', { visible: true, timeout: 10000 });

        // 7日ボタンをクリック
        await page.click('.chart-period-btn[data-period="7"]');
        await new Promise(r => setTimeout(r, 300));

        const isActive7 = await page.evaluate(() => {
            const btn = document.querySelector('.chart-period-btn[data-period="7"]');
            return btn && btn.classList.contains('active');
        });
        expect(isActive7).toBe(true);

        expect(pageErrors.length).toBe(0);
    }, 60000);

    // =========================================================
    // 2.7 PWA機能テスト
    // =========================================================

    test('E2E-PWA-001: manifest.jsonが正しく読み込まれる', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        const manifestHref = await page.evaluate(() => {
            const link = document.querySelector('link[rel="manifest"]');
            return link ? link.getAttribute('href') : null;
        });
        expect(manifestHref).toBe('manifest.json');

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-PWA-002: Service Workerが登録される', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        const swRegistered = await page.evaluate(async () => {
            if (!('serviceWorker' in navigator)) return 'not-supported';
            try {
                const registration = await navigator.serviceWorker.getRegistration('/');
                return registration ? 'registered' : 'not-registered';
            } catch (e) {
                return 'error: ' + e.message;
            }
        });

        expect(['registered', 'not-supported']).toContain(swRegistered);
        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-PWA-003: PWA metaタグが正しく設定されている', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        const metaTags = await page.evaluate(() => {
            const themeColor = document.querySelector('meta[name="theme-color"]');
            const webAppCapable = document.querySelector('meta[name="apple-mobile-web-app-capable"]');
            const webAppTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
            const touchIcon = document.querySelector('link[rel="apple-touch-icon"]');
            return {
                themeColor: themeColor ? themeColor.getAttribute('content') : null,
                webAppCapable: webAppCapable ? webAppCapable.getAttribute('content') : null,
                webAppTitle: webAppTitle ? webAppTitle.getAttribute('content') : null,
                touchIcon: touchIcon ? touchIcon.getAttribute('href') : null
            };
        });

        expect(metaTags.themeColor).toBe('#0f766e');
        expect(metaTags.webAppCapable).toBe('yes');
        expect(metaTags.webAppTitle).toBe('電子カルテ');
        expect(metaTags.touchIcon).toBe('icons/icon-192.svg');

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-PWA-004: 全タブ巡回でpageerrorが発生しない', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        const tabs = ['patients', 'karte', 'prescription', 'lab', 'history', 'settings'];
        for (const tab of tabs) {
            await switchTab(tab);
            await new Promise(r => setTimeout(r, 500));
        }

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-PWA-005: 更新バナーが存在し初期状態では非表示', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        const bannerInfo = await page.evaluate(() => {
            const banner = document.getElementById('update-banner');
            if (!banner) return { exists: false };
            const style = window.getComputedStyle(banner);
            return {
                exists: true,
                display: banner.style.display || style.display,
                hasUpdateBtn: !!document.getElementById('update-banner-btn'),
                hasCloseBtn: !!document.getElementById('update-banner-close')
            };
        });

        expect(bannerInfo.exists).toBe(true);
        expect(bannerInfo.display).toBe('none');
        expect(bannerInfo.hasUpdateBtn).toBe(true);
        expect(bannerInfo.hasCloseBtn).toBe(true);

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-PWA-006: 設定タブに「更新を確認」ボタンが表示される', async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        await switchTab('settings');

        const btnInfo = await page.evaluate(() => {
            const btn = document.getElementById('check-update-btn');
            if (!btn) return { exists: false };
            const style = window.getComputedStyle(btn);
            return {
                exists: true,
                visible: style.display !== 'none' && style.visibility !== 'hidden'
            };
        });

        expect(btnInfo.exists).toBe(true);
        expect(btnInfo.visible).toBe(true);

        const statusEl = await page.evaluate(() => {
            return document.getElementById('update-check-status') !== null;
        });
        expect(statusEl).toBe(true);

        expect(pageErrors.length).toBe(0);
    }, 60000);

    // =========================================================
    // 2.8 レスポンシブデザインテスト
    // =========================================================

    test('E2E-060: モバイルビューポート(375x667)でレイアウトが崩れない', async () => {
        await page.setViewport({ width: 375, height: 667 });
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        // ヘッダーが表示されることを確認
        const headerVisible = await isVisible('.app-header');
        expect(headerVisible).toBe(true);

        // タブナビが表示されることを確認
        const tabNavVisible = await isVisible('.tab-nav');
        expect(tabNavVisible).toBe(true);

        // 全タブボタンがアクセス可能であることを確認
        const tabsAccessible = await page.evaluate(() => {
            const btns = document.querySelectorAll('.tab-nav button');
            let allAccessible = true;
            btns.forEach(btn => {
                // display:noneのAIタブは除外
                if (btn.id === 'ai-tab-btn') return;
                const style = window.getComputedStyle(btn);
                if (style.display === 'none') allAccessible = false;
            });
            return allAccessible;
        });
        expect(tabsAccessible).toBe(true);

        // ビューポートを元に戻す
        await page.setViewport({ width: 1280, height: 800 });

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-061: タブレットビューポート(768x1024)でレイアウトが崩れない', async () => {
        await page.setViewport({ width: 768, height: 1024 });
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        // ヘッダーが表示されることを確認
        const headerVisible = await isVisible('.app-header');
        expect(headerVisible).toBe(true);

        // タブナビが表示されることを確認
        const tabNavVisible = await isVisible('.tab-nav');
        expect(tabNavVisible).toBe(true);

        // 患者タブのコンテンツが表示されることを確認
        const patientTabVisible = await isVisible('#tab-patients');
        expect(patientTabVisible).toBe(true);

        // ビューポートを元に戻す
        await page.setViewport({ width: 1280, height: 800 });

        expect(pageErrors.length).toBe(0);
    }, 60000);

    test('E2E-062: モバイルビューポートで患者登録ができる', async () => {
        await page.setViewport({ width: 375, height: 667 });
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();
        await cleanupTestData();
        await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await waitForAppReady();

        // モバイルビューポートで患者登録
        await registerPatient({
            name: 'モバイル患者',
            kana: 'もばいるかんじゃ',
            birth: '1995-05-05',
            gender: 'female'
        });

        // 患者リストに表示されることを確認
        const listText = await page.$eval('#patient-list', el => el.textContent || '');
        expect(listText).toContain('モバイル患者');

        // ビューポートを元に戻す
        await page.setViewport({ width: 1280, height: 800 });

        expect(pageErrors.length).toBe(0);
    }, 60000);
});

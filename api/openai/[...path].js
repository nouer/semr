const { Readable } = require('stream');

/**
 * Vercel Serverless Function: OpenAI reverse proxy (same-origin)
 *
 * - ブラウザから api.openai.com を直叩きするとCORSでブロックされるため、
 *   同一オリジン (/openai/*) -> このFunction -> OpenAI という経路にする。
 * - クライアントが送った Authorization ヘッダをそのままOpenAIへ転送する。
 * - stream(SSE) もそのまま中継できるよう、レスポンスボディをパイプする。
 */
module.exports = async (req, res) => {
    // path param: /api/openai/<...path>
    const parts = Array.isArray(req.query.path) ? req.query.path : [req.query.path].filter(Boolean);
    const upstreamPath = parts.join('/');
    const url = `https://api.openai.com/${upstreamPath}`;

    // Authorization は必須（なければ即エラー）
    const authorization = req.headers.authorization;
    if (!authorization) {
        res.statusCode = 400;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: { message: 'Missing Authorization header' } }));
        return;
    }

    // upstreamへ転送するヘッダ（必要最小限）
    const headers = {
        authorization,
    };
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
    if (req.headers.accept) headers.accept = req.headers.accept;

    // fetchへreq(stream)を渡すには duplex 指定が必要（Nodeの制約）
    const method = req.method || 'GET';
    const hasBody = !['GET', 'HEAD'].includes(method.toUpperCase());

    let upstreamRes;
    try {
        upstreamRes = await fetch(url, {
            method,
            headers,
            body: hasBody ? req : undefined,
            duplex: hasBody ? 'half' : undefined,
        });
    } catch (e) {
        res.statusCode = 502;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: { message: `Upstream fetch failed: ${e.message}` } }));
        return;
    }

    res.statusCode = upstreamRes.status;

    // 主要ヘッダのみ透過（Vercel環境依存のため、過剰な転送は避ける）
    const contentType = upstreamRes.headers.get('content-type');
    if (contentType) res.setHeader('content-type', contentType);
    const cacheControl = upstreamRes.headers.get('cache-control');
    if (cacheControl) res.setHeader('cache-control', cacheControl);

    // ストリームをそのまま転送
    if (upstreamRes.body) {
        Readable.fromWeb(upstreamRes.body).pipe(res);
        return;
    }

    // bodyがないケース（保険）
    const text = await upstreamRes.text().catch(() => '');
    res.end(text);
};

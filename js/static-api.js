(() => {
  'use strict';
  const nativeFetch = window.fetch.bind(window);
  const root = new URL('.', document.baseURI);
  let manifestPromise;
  const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
  const manifest = () => {
    if (!manifestPromise) manifestPromise = nativeFetch(new URL('data/static-demo-cases/manifest.json', root), { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`Static manifest request failed (${response.status})`);
        return response.json();
      });
    return manifestPromise;
  };
  const asBase64 = async (asset) => {
    const response = await nativeFetch(new URL(asset, root));
    if (!response.ok) throw new Error(`Mask request failed (${response.status})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  };
  window.fetch = async (input, options = {}) => {
    const requestUrl = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (!requestUrl.pathname.includes('/api/demo/')) return nativeFetch(input, options);
    const method = String(options.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
    if (method !== 'GET') return jsonResponse({ detail: 'This static demo is read-only.' }, 405);
    if (/\/api\/demo\/cases\/?$/.test(requestUrl.pathname)) {
      const payload = await manifest();
      return jsonResponse({ cases: (payload.cases || []).map((item) => ({ case_id: item.case_id, input_image: item.input_image })) });
    }
    const match = requestUrl.pathname.match(/\/api\/demo\/cases\/([^/]+)(?:\/(.*))?$/);
    if (!match) return jsonResponse({ detail: 'Static API endpoint not found.' }, 404);
    const caseId = decodeURIComponent(match[1]);
    const action = match[2] || '';
    const payload = await manifest();
    const item = (payload.cases || []).find((candidate) => candidate.case_id === caseId);
    if (!item) return jsonResponse({ detail: `Unknown static case: ${caseId}` }, 404);
    if (!action) return jsonResponse(item);
    if (action === 'jobs/active') return jsonResponse({ job: null });
    if (action === 'review') {
      const annotationResponse = await nativeFetch(new URL(item.annotation_url, root), { cache: 'no-store' });
      if (!annotationResponse.ok) return jsonResponse({ detail: 'Review annotation is unavailable.' }, 404);
      const review = await annotationResponse.json();
      review.image_url = item.input_image;
      review.objects = await Promise.all((review.objects || []).map(async (object, index) => ({
        ...object, mask_b64: await asBase64((item.masks[index] || {}).url),
      })));
      return jsonResponse(review);
    }
    return jsonResponse({ detail: 'Static API endpoint not found.' }, 404);
  };
  const lockReadOnlyControls = () => {
    document.querySelectorAll('.object-name').forEach((input) => { input.readOnly = true; });
    const state = document.getElementById('systemState');
    if (state && state.textContent === 'Ready') state.textContent = 'Static · Ready';
  };
  new MutationObserver(lockReadOnlyControls).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('DOMContentLoaded', lockReadOnlyControls);
})();

/* =============================================================================
 * app.js —— 读取数据、渲染项目、处理切换与交互
 * 依赖：无。原生 JS，直接在浏览器里跑。
 * 数据来源优先级：window.SITE_DATA（data/projects.js）> fetch('data/projects.json')
 * ========================================================================== */
(() => {
  'use strict';

  /* --------------------------------------------------------------- helpers */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ================================================================ i18n ===
   * 数据里任何面向读者的字段都可以写成 { zh: "中文", en: "English" }，
   * 也可以直接写一个字符串（那就两种语言共用，比如人名、数字、代码）。
   * t() 负责按当前语言取值，缺失的语言回落到另一种，不会渲染出 undefined。
   * ====================================================================== */
  const LANGS = ['zh', 'en'];
  const LANG_KEY = 'pp-lang';

  /** 首次访问按浏览器语言猜，之后跟随用户的选择 */
  function initialLang() {
    const saved = localStorage.getItem(LANG_KEY);
    if (LANGS.includes(saved)) return saved;
    return 'en';
  }
  let LANG = initialLang();

  /** 取当前语言的值。传入字符串/数字则原样返回。 */
  function t(v) {
    if (v === null || v === undefined) return '';
    if (typeof v !== 'object' || Array.isArray(v)) return v;
    // 只认 zh/en 两个键，别的对象原样返回（避免误伤结构化数据）
    if (!LANGS.some((k) => k in v)) return v;
    const other = LANGS.find((k) => k !== LANG);
    return v[LANG] ?? v[other] ?? '';
  }

  /** 界面文案（按钮、提示这类不属于内容的字） */
  const UI = {
    zh: {
      skip: '跳到正文', loading: '正在加载…', empty: '这个栏目还没有内容。',
      noContent: '还没有任何内容。',
      readMore: '阅读全文', viewProject: '查看项目',
      viewAll: (n) => `查看全部 ${n} 项`,
      abstract: '摘要', overview: '概览', bibtex: 'BibTeX', citeUs: '引用',
      ack: '致谢',
      copy: '复制', copied: '已复制',
      navLabel: '主导航', tocLabel: '章节导航', footerLabel: '页脚链接',
      pickProject: '选择项目', zoomIn: (c) => `放大查看：${c}`,
      closePreview: '关闭预览', compareHint: (a) => `对比滑块：向右显示 ${a}`,
      toLight: '切换到浅色模式', toDark: '切换到深色模式',
      switchLang: '切换到 English', langShort: '中',
      contact: '联系我们',
      loadFailTitle: '内容加载失败',
      loadFailBody:
        '没能读到站点数据。确认 <code>data/projects.js</code> 存在并被 index.html 引用；' +
        '如果你改成了 <code>data/projects.json</code>，需要通过 http 打开页面' +
        '（例如 <code>python -m http.server</code>），file:// 协议下浏览器会拦掉 fetch。',
    },
    en: {
      skip: 'Skip to content', loading: 'Loading…', empty: 'Nothing here yet.',
      noContent: 'No content yet.',
      readMore: 'Read more', viewProject: 'View project',
      viewAll: (n) => `View all ${n}`,
      abstract: 'Abstract', overview: 'Overview', bibtex: 'BibTeX', citeUs: 'Cite us',
      ack: 'Acknowledgements',
      copy: 'Copy', copied: 'Copied',
      navLabel: 'Main navigation', tocLabel: 'On this page', footerLabel: 'Footer links',
      pickProject: 'Select a project', zoomIn: (c) => `Zoom in: ${c}`,
      closePreview: 'Close preview', compareHint: (a) => `Comparison slider: drag right for ${a}`,
      toLight: 'Switch to light mode', toDark: 'Switch to dark mode',
      switchLang: '切换到中文', langShort: 'EN',
      contact: 'Contact',
      loadFailTitle: 'Failed to load content',
      loadFailBody:
        'Could not read the site data. Make sure <code>data/projects.js</code> exists and is ' +
        'referenced from index.html. If you switched to <code>data/projects.json</code>, serve the ' +
        'page over http (e.g. <code>python -m http.server</code>) — browsers block fetch on file://.',
    },
  };
  /** 界面文案取值：ui('readMore')，带参数的 ui('viewAll', 3) */
  const ui = (key, ...args) => {
    const v = (UI[LANG] || UI.zh)[key];
    return typeof v === 'function' ? v(...args) : (v ?? '');
  };

  /** 转义用户内容里的 HTML，防止 json 里的字符串破坏结构 */
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** 只对我们明确允许富文本的字段用（body/caption 里想写 <b>/<code>/<a>） */
  const rich = (s) => String(s ?? '');

  const el = (tag, attrs = {}, html) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    if (html !== undefined) n.innerHTML = html;
    return n;
  };

  const isVideo = (src = '') => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(src);

  /* ----------------------------------------------------------------- icons */
  const ICONS = {
    paper: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
    arxiv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h6l4 8-4 8H4l4-8z"/><path d="M14 4h6l-4 8 4 8h-6"/></svg>',
    code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18-6-6 6-6M15 6l6 6-6 6"/></svg>',
    github: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.5A10.5 10.5 0 0 0 1.5 12c0 4.64 3.01 8.57 7.18 9.96.53.1.72-.23.72-.5v-1.76c-2.92.64-3.54-1.4-3.54-1.4-.48-1.22-1.17-1.55-1.17-1.55-.96-.65.07-.64.07-.64 1.06.08 1.61 1.09 1.61 1.09.94 1.6 2.46 1.14 3.06.87.1-.68.37-1.15.67-1.41-2.33-.27-4.78-1.17-4.78-5.19 0-1.15.41-2.09 1.08-2.82-.11-.27-.47-1.34.1-2.79 0 0 .88-.28 2.87 1.07a9.9 9.9 0 0 1 5.22 0c2-1.35 2.87-1.07 2.87-1.07.57 1.45.21 2.52.1 2.79.67.73 1.08 1.67 1.08 2.82 0 4.03-2.46 4.92-4.8 5.18.38.33.72.97.72 1.96v2.9c0 .28.19.61.73.5A10.5 10.5 0 0 0 22.5 12A10.5 10.5 0 0 0 12 1.5"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="m10 9.5 5 2.5-5 2.5z" fill="currentColor" stroke="none"/></svg>',
    demo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M21 3l-9 9"/><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/></svg>',
    hf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/></svg>',
    data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/></svg>',
    twitter: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.64l-5.2-6.8-5.95 6.8H1.71l7.73-8.84L1.29 2.25h6.81l4.71 6.23zm-1.16 17.52h1.83L5.7 4.13H3.74z"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12.5 5 5L20 6.5"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
    caret: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    slider: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m10 8-4 4 4 4M14 8l4 4-4 4"/></svg>',
    zoom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M16 16l5 5M11 8v6M8 11h6"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H6M12 6l-6 6 6 6"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M12 6l6 6-6 6"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5"/></svg>',
  };
  const icon = (name) => ICONS[name] || ICONS.link;

  /* ------------------------------------------------------------ 数据加载 */
  async function loadData() {
    if (window.SITE_DATA) return window.SITE_DATA;
    const res = await fetch('data/projects.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`projects.json ${res.status}`);
    return res.json();
  }

  /* --------------------------------------------------------------- 渲染块 */

  function renderMedia(src, { poster, autoplay = true, alt = '' } = {}) {
    if (isVideo(src)) {
      const v = el('video', {
        src, poster, playsinline: true, muted: true, loop: true,
        controls: !autoplay, preload: 'metadata',
        autoplay: autoplay ? true : null,
      });
      v.muted = true; // 属性之外还要设 property，否则部分浏览器不允许自动播放
      // 尊重 reduce-motion：不自动播，给出控制条
      if (autoplay && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        v.removeAttribute('autoplay'); v.controls = true;
      }
      return v;
    }
    return el('img', { src, alt, loading: 'lazy', decoding: 'async' });
  }

  function renderAuthors(p) {
    const frag = document.createDocumentFragment();
    if (Array.isArray(p.authors) && p.authors.length) {
      const names = p.authors.map((a) => {
        const sup = [
          ...(a.affil || []).map(String),
          ...(a.note ? [t(a.note)] : []),
        ].join(',');
        const inner = `${esc(t(a.name))}${sup ? `<sup>${esc(sup)}</sup>` : ''}`;
        const href = a.url || (a.email ? `mailto:${a.email}` : '');
        const external = /^https?:/.test(href);
        return href ? `<a href="${esc(href)}"${external ? ' target="_blank" rel="noopener"' : ''}>${inner}</a>` : inner;
      });
      frag.append(el('div', { class: 'authors' }, names.join('<span aria-hidden="true">, </span>')));
    }
    if (Array.isArray(p.affiliations) && p.affiliations.length) {
      const list = p.affiliations
        .map((a, i) => `<sup>${i + 1}</sup>${esc(t(a))}`)
        .join('<span aria-hidden="true">　</span>');
      frag.append(el('div', { class: 'affils' }, list));
    }
    if (p.authorNotes) frag.append(el('div', { class: 'author-notes' }, esc(t(p.authorNotes))));
    return frag;
  }

  function renderLinkRow(links = []) {
    if (!links.length) return null;
    const row = el('div', { class: 'link-row' });
    links.forEach((l, i) => {
      const a = el('a', {
        class: `btn${i === 0 ? '' : ' btn--ghost'}`,
        href: l.href || '#',
        target: /^https?:/.test(l.href || '') ? '_blank' : null,
        rel: /^https?:/.test(l.href || '') ? 'noopener' : null,
      }, `${icon(l.icon)}<span>${esc(t(l.label))}</span>`);
      row.append(a);
    });
    return row;
  }

  /** 标题里 *星号* 包住的词渲染成品牌色强调；其余部分转义。 */
  function titleHTML(title) {
    return String(t(title) ?? '')
      .split(/(\*[^*]+\*)/g)
      .map((part) =>
        /^\*[^*]+\*$/.test(part)
          ? `<em>${esc(part.slice(1, -1))}</em>`
          : esc(part))
      .join('');
  }

  /** 去掉标题里的强调星号，用于 meta、aria-label、切换器这些纯文本场合 */
  const plain = (v) => String(t(v) ?? '').replace(/\*/g, '');

  /** hero 的三层背景，home / list / detail 共用 */
  function heroBackdrop(host) {
    host.append(el('div', { class: 'hero__aurora', 'aria-hidden': 'true' }));
    host.append(el('div', { class: 'hero__grid', 'aria-hidden': 'true' }));
    host.append(el('div', { class: 'hero__noise', 'aria-hidden': 'true' }));
  }

  /** 返回上一层的面包屑（详情页 → 所属栏目列表页） */
  function backLink(data, navKey, go) {
    const nav = (data.nav || []).find((n) => n.key === navKey);
    if (!nav) return null;
    const a = el('a', { class: 'hero__back', href: urlFor.list(navKey) },
      `${icon('back')}<span>${esc(t(nav.label))}</span>`);
    a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      go({ view: 'list', navKey });
    });
    return a;
  }

  function renderHero(p, host, { data, navKey, go } = {}) {
    host.innerHTML = '';
    heroBackdrop(host);

    const wrap = el('div', { class: 'wrap' });

    if (data && navKey && go) {
      const back = backLink(data, navKey, go);
      if (back) wrap.append(back);
    }

    wrap.append(el('h1', { class: 'hero__title', id: 'project-title' }, titleHTML(p.title)));
    if (p.subtitle) wrap.append(el('p', { class: 'hero__subtitle' }, rich(t(p.subtitle))));

    // 会议信息：标题下方一行居中排版，两侧发丝线。没写 venue 就整块不出现。
    if (p.venue) {
      const line = esc(t(p.venue)) +
        (p.badge ? `<span class="badge">${esc(t(p.badge))}</span>` : '');
      wrap.append(el('div', { class: 'hero__venue' },
        `<span class="hero__venue-text">${line}</span>`));
      if (p.venueNote) {
        wrap.append(el('p', { class: 'hero__venue-note' }, esc(t(p.venueNote))));
      }
    }

    wrap.append(renderAuthors(p));

    const links = renderLinkRow(p.links);
    if (links) wrap.append(links);

    // teaser
    if (p.teaser && p.teaser.src) {
      const fig = el('figure', { class: 'teaser', style: 'margin-inline:0' });
      const frame = el('div', { class: 'frame' });
      frame.append(renderMedia(p.teaser.src, {
        poster: p.teaser.poster, autoplay: true,
        alt: t(p.teaser.alt) || `${plain(p.title)} teaser`,
      }));
      // teaser video: show controls so user can unmute
      const vid = frame.querySelector('video');
      if (vid) vid.controls = true;
      fig.append(frame);
      if (p.teaser.caption) {
        fig.append(el('figcaption', { class: 'caption' }, rich(t(p.teaser.caption))));
      }
      wrap.append(fig);
    }

    // highlights
    if (Array.isArray(p.highlights) && p.highlights.length) {
      const stats = el('div', { class: 'stats' });
      p.highlights.forEach((h) => {
        stats.append(el('div', { class: 'stat' },
          `<div class="stat__value">${esc(t(h.value))}</div>` +
          `<div class="stat__label">${esc(t(h.label))}</div>`));
      });
      wrap.append(stats);
    }

    host.append(wrap);
  }

  /* ---- 各 section 类型 ---- */
  const SECTION_RENDERERS = {
    text(s) {
      return el('div', { class: 'prose section__body' }, rich(t(s.body)));
    },

    figure(s) {
      const box = el('div');
      if (s.body) box.append(el('div', { class: 'prose section__body' }, rich(t(s.body))));
      const fig = el('figure', { class: s.figureClass || '', style: 'margin:2rem 0 0' });
      const frame = el('div', { class: 'frame' });
      frame.append(renderMedia(s.src, {
        poster: s.poster, alt: t(s.alt) || t(s.title) || 'figure',
      }));
      fig.append(frame);
      if (s.caption) fig.append(el('figcaption', { class: 'caption' }, rich(t(s.caption))));
      box.append(fig);
      return box;
    },

    video(s) {
      return SECTION_RENDERERS.figure(s);
    },

    simulationGallery(s) {
      const box = el('div', { class: 'simulation-gallery' });
      if (s.body) box.append(el('div', { class: 'prose section__body' }, rich(t(s.body))));
      const galleries = Array.isArray(s.galleries) && s.galleries.length
        ? s.galleries : [{ title: s.subtitle || 'Blender Simulation', items: s.items || [] }];
      galleries.forEach((gallery) => {
        const items = Array.isArray(gallery.items) ? gallery.items : [];
        if (!items.length) return;
        box.append(el('h3', { class: 'simulation-gallery__title' }, esc(t(gallery.title) || 'Simulation')));
        if (gallery.note) box.append(el('p', { class: 'simulation-gallery__note' }, esc(t(gallery.note))));
        const viewport = el('div', { class: 'simulation-gallery__viewport', 'aria-live': 'polite' });
        const stage = el('div', { class: 'simulation-gallery__stage' });
        const previous = el('button', { class: 'simulation-gallery__control simulation-gallery__control--prev', type: 'button', 'aria-label': 'Previous simulation demo' }, '‹');
        const next = el('button', { class: 'simulation-gallery__control simulation-gallery__control--next', type: 'button', 'aria-label': 'Next simulation demo' }, '›');
        const dots = el('div', { class: 'simulation-gallery__dots', role: 'tablist', 'aria-label': `${t(gallery.title) || 'Simulation'} demos` });
        let index = 0;
        const renderItem = () => {
          const item = items[index];
          stage.replaceChildren();
          const video = renderMedia(item.src, { autoplay: true, alt: t(item.title) || `Simulation demo ${index + 1}` });
          video.classList.add('simulation-gallery__video');
          stage.append(video);
          const caption = el('div', { class: 'simulation-gallery__caption' });
          caption.append(el('h4', { class: 'simulation-gallery__item-title' }, esc(t(item.title) || `Demo ${index + 1}`)));
          if (item.body) caption.append(el('p', {}, rich(t(item.body))));
          stage.append(caption);
          $$('.simulation-gallery__dot', dots).forEach((dot, dotIndex) => {
            dot.setAttribute('aria-selected', String(dotIndex === index));
            dot.tabIndex = dotIndex === index ? 0 : -1;
          });
        };
        items.forEach((item, itemIndex) => {
          const dot = el('button', { class: 'simulation-gallery__dot', type: 'button', role: 'tab', 'aria-label': `Show ${t(item.title) || `demo ${itemIndex + 1}`}`, 'aria-selected': 'false', tabindex: '-1' }, String(itemIndex + 1));
          dot.addEventListener('click', () => { index = itemIndex; renderItem(); });
          dots.append(dot);
        });
        previous.addEventListener('click', () => { index = (index - 1 + items.length) % items.length; renderItem(); });
        next.addEventListener('click', () => { index = (index + 1) % items.length; renderItem(); });
        viewport.append(previous, stage, next);
        box.append(viewport, dots);
        renderItem();
      });
      return box;
    },

    astraGallery(s) {
      const box = el('div', { class: 'astra-results', dataset: { astraGallery: '' } });
      if (s.body) box.append(el('div', { class: 'prose section__body' }, rich(t(s.body))));
      box.append(el('div', { class: 'astra-results__head' },
        '<p>Select a thumbnail to explore its interactive 3D scene.</p>'));
      box.append(el('div', {
        class: 'astra-results__status', role: 'status', 'aria-live': 'polite',
      }, 'Loading Astra scenes…'));
      return box;
    },

    staticGallery(s) {
      const box = el('div', { class: 'static-results', dataset: { staticInteractiveGallery: '' } });
      if (s.body) box.append(el('div', { class: 'prose section__body' }, rich(t(s.body))));
      box.append(el('div', { class: 'static-gallery-status', role: 'status', 'aria-live': 'polite' }, 'Loading interactive scene results…'));
      return box;
    },

    gallery(s) {
      const box = el('div');
      if (s.body) box.append(el('div', { class: 'prose section__body' }, rich(t(s.body))));
      const grid = el('div', { class: 'gallery', dataset: { cols: String(s.columns || 3) }, style: 'margin-top:1.5rem' });
      (s.items || []).forEach((it) => {
        const cap = t(it.caption) || '';
        const tile = el('button', {
          class: 'tile', type: 'button',
          'aria-label': ui('zoomIn', cap || 'sample'),
          dataset: { src: it.src, caption: cap },
        });
        const media = el('div', { class: 'tile__media' });
        media.append(renderMedia(it.src, { poster: it.poster, alt: cap || 'sample', autoplay: true }));
        media.append(el('span', { class: 'tile__zoom', 'aria-hidden': 'true' }, icon('zoom')));
        tile.append(media);
        if (cap) tile.append(el('div', { class: 'tile__caption' }, rich(cap)));
        grid.append(tile);
      });
      box.append(grid);
      return box;
    },

    compare(s) {
      const box = el('div');
      if (s.body) box.append(el('div', { class: 'prose section__body' }, rich(t(s.body))));
      const beforeLabel = t(s.before.label) || 'Before';
      const afterLabel = t(s.after.label) || 'After';
      const c = el('div', { class: 'compare', style: 'margin-top:1.5rem' });
      c.append(el('img', { src: s.before.src, alt: beforeLabel, loading: 'lazy' }));
      const after = el('div', { class: 'compare__after' });
      after.append(el('img', { src: s.after.src, alt: afterLabel, loading: 'lazy' }));
      c.append(after);
      c.append(el('div', { class: 'compare__bar' }));
      c.append(el('div', { class: 'compare__handle' }, icon('slider')));
      c.append(el('span', { class: 'compare__tag compare__tag--l' }, esc(beforeLabel)));
      c.append(el('span', { class: 'compare__tag compare__tag--r' }, esc(afterLabel)));
      c.append(el('input', {
        class: 'compare__range', type: 'range', min: '0', max: '100', value: '50', step: '0.5',
        'aria-label': ui('compareHint', afterLabel),
      }));
      box.append(c);
      if (s.caption) box.append(el('p', { class: 'caption' }, rich(t(s.caption))));
      return box;
    },

    table(s) {
      const box = el('div');
      if (s.body) box.append(el('div', { class: 'prose section__body' }, rich(t(s.body))));
      const scroll = el('div', { class: 'table-scroll', style: 'margin-top:1.5rem' });
      const table = el('table', { class: 'data' });
      table.append(el('thead', {},
        `<tr>${(s.columns || []).map((c) => `<th scope="col">${esc(t(c))}</th>`).join('')}</tr>`));
      const hl = new Set(s.highlightRows || []);
      const body = el('tbody');
      (s.rows || []).forEach((r, i) => {
        const cells = r.map((cell, j) =>
          j === 0 ? `<th scope="row" style="font-weight:inherit">${esc(t(cell))}</th>`
                  : `<td>${esc(t(cell))}</td>`).join('');
        body.append(el('tr', { dataset: hl.has(i) ? { highlight: 'true' } : {} }, cells));
      });
      table.append(body);
      scroll.append(table);
      box.append(scroll);
      if (s.footnote) box.append(el('p', { class: 'table-note' }, rich(t(s.footnote))));
      return box;
    },

    features(s) {
      const box = el('div');
      if (s.body) box.append(el('div', { class: 'prose section__body' }, rich(t(s.body))));
      const grid = el('div', { class: 'cards', style: 'margin-top:1.5rem' });
      (s.items || []).forEach((it) => {
        grid.append(el('div', { class: 'card' },
          `<div class="card__icon">${icon(it.icon || 'spark')}</div>` +
          `<h3 class="card__title">${esc(t(it.title))}</h3>` +
          `<div class="card__body">${rich(t(it.body))}</div>`));
      });
      box.append(grid);
      return box;
    },

    steps(s) {
      const box = el('div');
      if (s.body) box.append(el('div', { class: 'prose section__body' }, rich(t(s.body))));
      const ol = el('ol', { class: 'steps', style: 'margin-top:1.5rem' });
      (s.items || []).forEach((it) => {
        ol.append(el('li', {},
          `<div><div class="step__title">${esc(t(it.title))}</div>` +
          `<div class="step__body">${rich(t(it.body))}</div></div>`));
      });
      box.append(ol);
      return box;
    },
  };

  function renderSection(s, index) {
    const renderer = SECTION_RENDERERS[s.type];
    if (!renderer) {
      console.warn(`[project-page] unknown section type: "${s.type}" — skipped`);
      return null;
    }
    const sec = el('section', {
      class: `section${index % 2 === 1 ? ' section--alt' : ''}`,
      id: s.id || `section-${index}`,
      dataset: { reveal: '' },
    });
    const wrap = el('div', { class: 'wrap' });
    if (s.title) {
      const head = el('div', { class: 'section__head' });
      if (s.eyebrow) head.append(el('div', { class: 'section__eyebrow' }, esc(t(s.eyebrow))));
      head.append(el('h2', { class: 'section__title' }, esc(t(s.title))));
      wrap.append(head);
    }
    wrap.append(renderer(s));
    sec.append(wrap);
    return sec;
  }

  function renderAbstract(p) {
    if (!p.abstract) return null;
    const sec = el('section', { class: 'section', id: 'abstract', dataset: { reveal: '' } });
    const wrap = el('div', { class: 'wrap' });
    const box = el('div', { class: 'abstract' });
    box.append(el('div', { class: 'section__head' },
      `<div class="section__eyebrow">${esc(ui('overview'))}</div>` +
      `<h2 class="section__title">${esc(ui('abstract'))}</h2>`));
    box.append(el('div', { class: 'abstract__text' }, rich(t(p.abstract))));
    wrap.append(box); sec.append(wrap);
    return sec;
  }

  function renderBibtex(p) {
    if (!p.bibtex) return null;
    const sec = el('section', { class: 'section section--alt', id: 'bibtex', dataset: { reveal: '' } });
    const wrap = el('div', { class: 'wrap' });
    wrap.append(el('div', { class: 'section__head' },
      `<div class="section__eyebrow">${esc(ui('citeUs'))}</div>` +
      `<h2 class="section__title">${esc(ui('bibtex'))}</h2>`));
    const block = el('div', { class: 'bibtex-block' });
    // bibtex 本身是代码，不分语言
    block.append(el('pre', {}, `<code>${esc(p.bibtex)}</code>`));
    block.append(el('button', {
      class: 'copy-btn', type: 'button',
    }, `${icon('copy')}<span>${esc(ui('copy'))}</span>`));
    wrap.append(block);
    if (p.acknowledgements) {
      wrap.append(el('div', { class: 'prose', style: 'margin-top:2.5rem' },
        `<h3 class="card__title">${esc(ui('ack'))}</h3>` +
        `<p style="color:var(--text-muted)">${rich(t(p.acknowledgements))}</p>`));
    }
    sec.append(wrap);
    return sec;
  }

  /* =========================================================== 首页 / 列表 ===
   * 条目卡片在两处复用：首页的栏目预览、栏目列表页。
   * ====================================================================== */

  /** 一条内容的卡片。research 显示 venue，blog 显示日期和阅读时长。 */
  function itemCard(item, navKey, go) {
    const card = el('a', {
      class: 'item', href: urlFor.detail(item.id),
      'aria-label': plain(item.title),
    });
    card.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      go({ view: 'detail', item, navKey });
    });

    if (item.thumb) {
      const media = el('div', { class: 'item__media' });
      media.append(el('img', { src: item.thumb, alt: '', loading: 'lazy' }));
      card.append(media);
    }

    // 元信息行：research 用 venue + 荣誉，blog 用日期 + 阅读时长
    const meta = (navKey === 'blog'
      ? [item.date, item.readingTime]
      : [item.venue, item.badge]).map(t).filter(Boolean).join(' · ');

    const sub = String(t(item.subtitle) || '').replace(/<[^>]+>/g, '');

    card.append(el('div', { class: 'item__body' },
      (meta ? `<div class="item__meta">${esc(meta)}</div>` : '') +
      `<h3 class="item__title">${titleHTML(item.title)}</h3>` +
      (sub ? `<p class="item__sub">${esc(sub)}</p>` : '') +
      `<span class="item__more">` +
      `${esc(navKey === 'blog' ? ui('readMore') : ui('viewProject'))} ${icon('arrow')}</span>`));

    return card;
  }

  function itemGrid(data, navKey, go, limit) {
    const items = itemsOf(data, navKey);
    const shown = limit ? items.slice(0, limit) : items;
    const grid = el('div', { class: 'item-grid' });
    shown.forEach((it) => grid.append(itemCard(it, navKey, go)));
    return { grid, total: items.length, shown: shown.length };
  }

  /** 首页 hero：团队一句话主张 + 简介 */
  function renderHomeHero(data, host) {
    host.innerHTML = '';
    heroBackdrop(host);
    const h = data.home || {};
    const wrap = el('div', { class: 'wrap' });
    wrap.append(el('h1', { class: 'hero__title hero__title--home' },
      titleHTML(h.title || data.site?.team || 'Team')));
    if (h.intro) wrap.append(el('p', { class: 'hero__subtitle' }, rich(t(h.intro))));
    host.append(wrap);
  }

  /** 首页正文：每个栏目一段，各显示前几条 + "查看全部" */
  function renderHomeSections(data, main, go) {
    (data.nav || []).forEach((nav, i) => {
      const { grid, total, shown } = itemGrid(data, nav.key, go, 3);
      if (!shown) return;

      const sec = el('section', {
        class: `section${i % 2 === 1 ? ' section--alt' : ''}`,
        id: nav.key, dataset: { reveal: '' },
      });
      const wrap = el('div', { class: 'wrap' });

      const head = el('div', { class: 'section__head section__head--row' });
      head.append(el('div', {},
        `<h2 class="section__title">${esc(t(nav.title) || t(nav.label))}</h2>` +
        (nav.intro ? `<p class="section__body">${rich(t(nav.intro))}</p>` : '')));

      if (total > shown) {
        const all = el('a', { class: 'link-more', href: urlFor.list(nav.key) },
          `${esc(ui('viewAll', total))} ${icon('arrow')}`);
        all.addEventListener('click', (e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          go({ view: 'list', navKey: nav.key });
        });
        head.append(all);
      }
      wrap.append(head);
      wrap.append(grid);
      sec.append(wrap);
      main.append(sec);
    });
  }

  /** 列表页 hero：栏目名 + 说明，比首页克制 */
  function renderListHero(data, navKey, host) {
    host.innerHTML = '';
    heroBackdrop(host);
    const nav = (data.nav || []).find((n) => n.key === navKey) || {};
    const wrap = el('div', { class: 'wrap' });
    wrap.append(el('h1', { class: 'hero__title hero__title--list' },
      esc(t(nav.title) || t(nav.label) || navKey)));
    if (nav.intro) wrap.append(el('p', { class: 'hero__subtitle' }, rich(t(nav.intro))));
    host.append(wrap);
  }

  /** 列表页正文：该栏目全部条目 */
  function renderList(data, navKey, main, go) {
    const { grid, total } = itemGrid(data, navKey, go);
    const sec = el('section', { class: 'section', id: 'list', dataset: { reveal: '' } });
    const wrap = el('div', { class: 'wrap' });
    if (!total) {
      wrap.append(el('p', { class: 'prose' }, esc(ui('empty'))));
    } else {
      wrap.append(grid);
    }
    sec.append(wrap);
    main.append(sec);
  }

  /* -------------------------------------------------------------- 章节导航 */
  function renderToc(entries) {
    const toc = $('#toc');
    if (!entries.length) { toc.hidden = true; return; }
    toc.hidden = false;
    toc.innerHTML = '';
    const inner = el('div', { class: 'wrap toc__inner' });
    entries.forEach(({ id, label }) => {
      inner.append(el('a', { href: `#${id}` }, esc(label)));
    });
    toc.append(inner);
  }

  /* ---------------------------------------------------------------- 交互 */

  /** 图片对比滑块 */
  function initCompare(root) {
    $$('.compare', root).forEach((c) => {
      const range = $('.compare__range', c);
      const set = (v) => c.style.setProperty('--pos', `${v}%`);
      set(range.value);
      range.addEventListener('input', () => set(range.value));
    });
  }

  /** Render the fixed local Astra/Mira paired scene gallery. */
  const ASTRA_DATA_URL = new URL('data/astra-background/', document.baseURI).href;
  const MIRA_DATA_URL = new URL('data/mira-scene-results/', document.baseURI).href;
  const assetUrl = (root, path) => new URL(`${root}${String(path || '').replace(/^\/+/, '')}`, document.baseURI).href;
  let activeAstraViewer = null;
  function initAstraGallery(root) {
    if (document.body.dataset.staticSite === 'true') return;
    $$('[data-astra-gallery]', root).forEach(async (host) => {
      const status = $('.astra-results__status', host);
      try {
        const [astraResponse, miraResponse] = await Promise.all([
          fetch(`${ASTRA_DATA_URL}manifest.json`, { cache: 'no-store' }),
          fetch(`${MIRA_DATA_URL}manifest.json`, { cache: 'no-store' }),
        ]);
        if (!astraResponse.ok) throw new Error(`Astra manifest request failed (${astraResponse.status})`);
        if (!miraResponse.ok) throw new Error(`Mira-Scene manifest request failed (${miraResponse.status})`);
        const [astraPayload, miraPayload] = await Promise.all([astraResponse.json(), miraResponse.json()]);
        const miraById = new Map((miraPayload.cases || []).map((scene) => [scene.id, scene]));
        const scenes = (astraPayload.scenes || []).map((scene) => ({
          scratch: scene, mira: miraById.get(scene.id),
        })).filter((pair) => pair.mira?.model && pair.mira?.environment && pair.scratch?.model && pair.scratch?.thumbnail);
        if (!scenes.length) throw new Error('no paired Astra / Mira-Scene cases are available');
        if (!document.body.contains(host)) return;

        const thumbs = el('div', { class: 'astra-thumbnails', role: 'listbox', 'aria-label': 'Available scene cases' });
        const pairViewer = el('div', { class: 'astra-viewer-pair' });
        const makePane = (title, ariaLabel) => {
          const pane = el('section', { class: 'astra-viewer-pane' });
          pane.append(el('h4', { class: 'astra-viewer-pane__title' }, title));
          const toolbar = el('div', { class: 'astra-viewer__toolbar' });
          const cameraLabel = el('label', {}, '<span>View</span>');
          const camera = el('select', { 'aria-label': `${ariaLabel}: select view` });
          cameraLabel.append(camera);
          const reset = el('button', { type: 'button' }, 'Reset view');
          const sectionLabel = el('label', {}, '<span>Section height</span>');
          const section = el('input', { type: 'range', min: '0', max: '100', value: '100', 'aria-label': `${ariaLabel}: section height` });
          sectionLabel.append(section);
          const wireLabel = el('label', { class: 'astra-viewer__check' });
          const wireframe = el('input', { type: 'checkbox', 'aria-label': `${ariaLabel}: wireframe` });
          wireLabel.append(wireframe, el('span', {}, 'Wireframe'));
          const fullscreen = el('button', { type: 'button' }, 'Fullscreen');
          toolbar.append(cameraLabel, reset, sectionLabel, wireLabel, fullscreen);
          const stage = el('div', { class: 'astra-viewer__stage astra-viewer__stage--empty' }, `<p>${ariaLabel} is not loaded.</p>`);
          const modelStatus = el('div', { class: 'astra-viewer__status', role: 'status', 'aria-live': 'polite' }, 'No scene selected.');
          pane.append(toolbar, stage, modelStatus);
          return { pane, camera, reset, section, wireframe, fullscreen, stage, modelStatus };
        };
        const scratchPane = makePane('From Scratch', 'From Scratch scene');
        const miraPane = makePane('With Mira-Scene', 'With Mira-Scene scene');
        pairViewer.append(scratchPane.pane, miraPane.pane);

        let selectionToken = 0;
        let selectedPair = null;
        let sceneViewer = null;
        let miraViewer = null;
        const disposePair = () => {
          sceneViewer?.dispose();
          miraViewer?.dispose();
          sceneViewer = null;
          miraViewer = null;
          if (activeAstraViewer?.host === host) activeAstraViewer = null;
        };
        const bindPane = (pane, isScratch) => {
          pane.reset.addEventListener('click', () => {
            if (isScratch) sceneViewer?.setCamera(sceneViewer.defaultCamera);
            else miraViewer?.resetView();
          });
          pane.section.addEventListener('input', () => isScratch
            ? sceneViewer?.setSection(Number(pane.section.value))
            : miraViewer?.setSection(Number(pane.section.value)));
          pane.wireframe.addEventListener('change', () => isScratch
            ? sceneViewer?.setWireframe(pane.wireframe.checked)
            : miraViewer?.setWireframe(pane.wireframe.checked));
          pane.fullscreen.addEventListener('click', async () => {
            try {
              if (document.fullscreenElement) await document.exitFullscreen();
              else await pane.stage.requestFullscreen();
            } catch (error) {
              pane.modelStatus.textContent = `Fullscreen is unavailable: ${error?.message || error}`;
            }
          });
        };
        bindPane(scratchPane, true);
        bindPane(miraPane, false);

        const select = async (pair, selectedButton) => {
          if (selectedPair === pair && sceneViewer?.model && miraViewer?.model) return;
          selectedPair = pair;
          const token = ++selectionToken;
          $$('.astra-thumbnail', thumbs).forEach((button) => {
            const selected = button === selectedButton;
            button.setAttribute('aria-selected', String(selected));
            button.tabIndex = selected ? 0 : -1;
          });
          disposePair();
          scratchPane.stage.replaceChildren(); scratchPane.stage.classList.remove('astra-viewer__stage--empty');
          miraPane.stage.replaceChildren(); miraPane.stage.classList.remove('astra-viewer__stage--empty');
          scratchPane.modelStatus.textContent = 'Initializing From Scratch viewer…';
          miraPane.modelStatus.textContent = 'Initializing Mira-Scene viewer…';
          try {
            const [{ AstraSceneViewer }, { StaticStage2Viewer }] = await Promise.all([
              import('./astra-viewer.js?v=20260918-2'),
              import('./static-stage2-viewer.js?v=20260918-2'),
            ]);
            if (token !== selectionToken || !document.body.contains(host)) return;
            const rotationInput = document.createElement('input');
            const rotationOutput = document.createElement('output');
            sceneViewer = new AstraSceneViewer(scratchPane.stage, scratchPane.modelStatus, scratchPane.camera);
            miraViewer = new StaticStage2Viewer(miraPane.stage, miraPane.modelStatus, pair.scratch.id, rotationInput, rotationOutput);
            activeAstraViewer = { host, dispose: disposePair };
            await Promise.all([
              sceneViewer.load(assetUrl('data/astra-background/', pair.scratch.model), pair.scratch.model_info),
              miraViewer.load(assetUrl('data/mira-scene-results/', pair.mira.model.replace(/^data\/mira-scene-results\//, '')), assetUrl('data/mira-scene-results/', pair.mira.environment.replace(/^data\/mira-scene-results\//, '')), pair.mira.method),
            ]);
            if (token === selectionToken) {
              scratchPane.modelStatus.textContent = 'Loaded · From Scratch scene';
              miraPane.modelStatus.textContent = 'Loaded · Mira-Scene reconstruction';
            }
          } catch (error) {
            if (token !== selectionToken) return;
            console.error('[project-page] paired scene failed', pair.scratch.id, error);
            scratchPane.modelStatus.textContent = `Unable to load From Scratch scene: ${error?.message || error}`;
            miraPane.modelStatus.textContent = `Unable to load Mira-Scene scene: ${error?.message || error}`;
            disposePair();
          }
        };

        scenes.forEach((pair, index) => {
          const button = el('button', {
            class: 'astra-thumbnail', type: 'button', role: 'option',
            'aria-selected': 'false', tabindex: index ? '-1' : '0',
            title: `Scene case ${index + 1}`, 'aria-label': `Scene case ${index + 1}`,
          });
          button.append(el('img', { src: assetUrl('data/astra-background/', pair.scratch.thumbnail), alt: '', loading: 'lazy', decoding: 'async' }));
          button.addEventListener('click', () => select(pair, button));
          button.addEventListener('keydown', (event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const buttons = $$('.astra-thumbnail', thumbs);
            const current = buttons.indexOf(button);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
              : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
            buttons[next].click(); buttons[next].focus();
          });
          thumbs.append(button);
        });
        status.replaceWith(thumbs, pairViewer);
        window.addEventListener('pagehide', disposePair, { once: true });
      } catch (error) {
        console.error('[project-page] Astra gallery failed', error);
        if (!document.body.contains(host)) return;
        status.classList.add('astra-results__status--error');
        status.setAttribute('role', 'alert');
        status.textContent = `Unable to load paired scenes: ${error?.message || error}`;
      }
    });
  }

  /** 灯箱。文档级监听只装一次，避免每次切项目都叠加一层。 */
  let lightboxBound = false;
  let closeLightbox = () => {};
  function initLightbox(root) {
    const box = $('#lightbox');
    const stage = $('#lightbox-stage');
    const cap = $('#lightbox-caption');
    let lastFocus = null;

    const open = (src, caption) => {
      stage.innerHTML = '';
      stage.append(renderMedia(src, { autoplay: false, alt: caption || '' }));
      cap.textContent = caption || '';
      box.dataset.open = 'true';
      document.body.style.overflow = 'hidden';
      lastFocus = document.activeElement;
      $('#lightbox-close').focus();
    };
    const close = () => {
      box.dataset.open = 'false';
      stage.innerHTML = '';
      document.body.style.overflow = '';
      if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    };
    closeLightbox = close;

    $$('.tile', root).forEach((tile) => {
      tile.addEventListener('click', () => open(tile.dataset.src, tile.dataset.caption));
    });
    $('#lightbox-close').onclick = close;
    box.onclick = (e) => { if (e.target === box) close(); };
    if (!lightboxBound) {
      lightboxBound = true;
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && box.dataset.open === 'true') closeLightbox();
      });
    }
  }

  /** BibTeX 复制 */
  function initCopy(root) {
    $$('.copy-btn', root).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const text = btn.parentElement.querySelector('code')?.textContent || '';
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // clipboard API 在 http/file 下可能不可用，退回 execCommand
          const ta = el('textarea', { style: 'position:fixed;opacity:0' });
          ta.value = text; document.body.append(ta); ta.select();
          document.execCommand('copy'); ta.remove();
        }
        btn.dataset.copied = 'true';
        btn.querySelector('span').textContent = ui('copied');
        setTimeout(() => {
          btn.dataset.copied = 'false';
          btn.querySelector('span').textContent = ui('copy');
        }, 1800);
      });
    });
  }

  /** 滚动进场动画 */
  function initReveal(root) {
    const items = $$('[data-reveal]', root);
    if (!('IntersectionObserver' in window)) {
      items.forEach((i) => (i.dataset.shown = 'true'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.dataset.shown = 'true'; io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.06 });
    items.forEach((i) => io.observe(i));
  }

  /** TOC 高亮当前章节 */
  let tocObserver = null;
  function initTocHighlight() {
    if (tocObserver) tocObserver.disconnect();
    const links = $$('#toc a');
    if (!links.length || !('IntersectionObserver' in window)) return;
    const map = new Map();
    links.forEach((a) => {
      const target = document.getElementById(a.hash.slice(1));
      if (target) map.set(target, a);
    });
    tocObserver = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        links.forEach((a) => a.removeAttribute('aria-current'));
        map.get(e.target)?.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    map.forEach((_, target) => tocObserver.observe(target));
  }

  /** header 阴影 + 顶部阅读进度条，合并到一个滚动回调里（rAF 节流） */
  function initScrollChrome() {
    const header = $('#site-header');
    const bar = $('#progress');
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      header.dataset.scrolled = String(y > 8);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.setProperty('--p', max > 0 ? String(Math.min(1, y / max)) : '0');
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  }

  /** 主题切换（跟随系统 → light → dark 循环，存 localStorage）。
   * 换语言时按钮的 aria-label 要跟着变，所以把刷新逻辑存成模块级函数。 */
  let refreshThemeLabel = () => {};
  function initTheme() {
    const btn = $('#theme-toggle');
    const KEY = 'pp-theme';
    const isDark = () =>
      document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    const apply = (mode) => {
      if (mode === 'light' || mode === 'dark') document.documentElement.dataset.theme = mode;
      else delete document.documentElement.dataset.theme;
      const dark = isDark();
      btn.innerHTML = dark ? ICONS.sun : ICONS.moon;
      btn.setAttribute('aria-label', dark ? ui('toLight') : ui('toDark'));
    };
    refreshThemeLabel = () => {
      btn.setAttribute('aria-label', isDark() ? ui('toLight') : ui('toDark'));
    };
    let mode = localStorage.getItem(KEY) || 'auto';
    apply(mode);
    btn.addEventListener('click', () => {
      mode = isDark() ? 'light' : 'dark';
      localStorage.setItem(KEY, mode);
      apply(mode);
    });
  }

  /* ---------------------------------------------------------- 语言切换 ---
   * 切语言不改 URL、不动滚动位置，只是把整页按新语言重画一遍。
   * 选择存 localStorage，下次访问沿用。 */
  function initLang(rerender) {
    const btn = $('#lang-toggle');
    const paint = () => {
      btn.textContent = ui('langShort');
      btn.setAttribute('aria-label', ui('switchLang'));
      document.documentElement.lang = LANG === 'zh' ? 'zh-CN' : 'en';
      $('#skip-link').textContent = ui('skip');
      $('#header-nav').setAttribute('aria-label', ui('navLabel'));
      $('#toc').setAttribute('aria-label', ui('tocLabel'));
      $('#footer-links').setAttribute('aria-label', ui('footerLabel'));
      $('#switcher-menu').setAttribute('aria-label', ui('pickProject'));
      $('#lightbox-close').setAttribute('aria-label', ui('closePreview'));
      // 首屏那句"正在加载…"：数据还没渲染上来时也跟着语言走
      const ph = $('#hero-placeholder');
      if (ph) ph.textContent = ui('loading');
      refreshThemeLabel();
    };
    paint();
    btn.addEventListener('click', () => {
      LANG = LANG === 'zh' ? 'en' : 'zh';
      localStorage.setItem(LANG_KEY, LANG);
      paint();
      rerender();
    });
  }

  /* ---------------------------------------------------------- 项目切换器 ---
   * 只列出同一栏目的条目：research 的项目之间互切，blog 的文章之间互切。
   * 跨栏目跳转走 header 主导航，不塞进这个菜单里。 */
  let switcherBound = false;
  function initSwitcher(data, navKey, current, onPick) {
    const btn = $('#switcher-btn');
    const menu = $('#switcher-menu');
    const label = $('#switcher-label');

    const items = itemsOf(data, navKey);
    const nav = (data.nav || []).find((n) => n.key === navKey) || {};

    label.textContent = plain(current.short || current.title);

    menu.innerHTML = '';
    menu.append(el('div', { class: 'switcher__menu-head' },
      `${esc(t(nav.label) || navKey)} · ${items.length}`));
    items.forEach((p) => {
      const item = el('button', {
        class: 'switcher__item', type: 'button', role: 'option',
        'aria-current': String(p.id === current.id),
      });
      if (p.thumb) item.append(el('img', { class: 'thumb', src: p.thumb, alt: '', loading: 'lazy' }));
      item.append(el('span', { class: 'meta' },
        `<span class="name">${esc(plain(p.short || p.title))}</span>` +
        `<span class="sub">${esc([p.venue, p.date].map(t).filter(Boolean).join(' · '))}</span>`));
      item.append(el('span', { class: 'tick', 'aria-hidden': 'true' }, icon('check')));
      item.addEventListener('click', () => { setOpen(false); onPick(p.id); });
      menu.append(item);
    });

    const setOpen = (open) => {
      menu.dataset.open = String(open);
      btn.setAttribute('aria-expanded', String(open));
    };

    btn.onclick = (e) => {
      e.stopPropagation();
      setOpen(menu.dataset.open !== 'true');
    };
    if (!switcherBound) {
      switcherBound = true;
      const closeAll = () => {
        menu.dataset.open = 'false';
        btn.setAttribute('aria-expanded', 'false');
      };
      document.addEventListener('click', (e) => {
        if (!$('#switcher').contains(e.target)) closeAll();
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
    }
    setOpen(false);
  }

  /* ================================================================= 路由 ===
   * 三种视图，全靠 query string 区分，没有真实子页面：
   *   index.html                 → home    首页（团队简介 + 各栏目预览）
   *   index.html?s=research      → list    栏目列表页
   *   index.html?p=<id>          → detail  项目/文章详情页
   * ====================================================================== */

  /** 栏目 key -> 该栏目下的条目数组 */
  function itemsOf(data, key) {
    if (key === 'research') return data.projects || [];
    if (key === 'blog') return data.posts || [];
    return [];
  }

  /** 在 projects 和 posts 里找 id，并带回它属于哪个栏目 */
  function findItem(data, id) {
    for (const nav of data.nav || []) {
      const hit = itemsOf(data, nav.key).find((x) => x.id === id);
      if (hit) return { item: hit, navKey: nav.key };
    }
    return null;
  }

  /** 解析当前 URL 想要哪个视图 */
  function parseRoute(data) {
    const q = new URLSearchParams(location.search);
    const p = q.get('p');
    if (p) {
      const found = findItem(data, p);
      if (found) return { view: 'detail', ...found };
    }
    const s = q.get('s');
    if (s && (data.nav || []).some((n) => n.key === s)) {
      return { view: 'list', navKey: s };
    }
    // Single-project shortcut: skip home/list, go straight to the project
    const allItems = [...(data.projects || []), ...(data.posts || [])];
    if (allItems.length === 1) {
      const only = allItems[0];
      const navKey = (data.projects || []).includes(only) ? 'research' : 'blog';
      return { view: 'detail', item: only, navKey };
    }
    return { view: 'home' };
  }

  const urlFor = {
    home: () => location.pathname,
    list: (key) => `${location.pathname}?s=${encodeURIComponent(key)}`,
    detail: (id) => `${location.pathname}?p=${encodeURIComponent(id)}`,
  };

  /* -------------------------------------------------------------- meta 改写 */
  function updateMeta(data, { view, item, navKey }) {
    const team = t(data.site?.team) || '';
    const set = (sel, attr, val) => { const n = $(sel); if (n) n.setAttribute(attr, val); };
    const strip = (s) => String(t(s) ?? '').replace(/<[^>]+>/g, '').replace(/\*/g, '');

    let title = team;
    let desc = strip(data.site?.tagline);
    let canonical = urlFor.home();
    let image = null;

    if (view === 'detail') {
      title = `${strip(item.title)}${team ? ` · ${team}` : ''}`;
      desc = strip(item.abstract || item.subtitle).slice(0, 200);
      canonical = urlFor.detail(item.id);
      if (item.teaser?.src && !isVideo(item.teaser.src)) image = item.teaser.src;
      if (Array.isArray(item.keywords) && item.keywords.length) {
        set('meta[name="keywords"]', 'content', item.keywords.map(t).join(', '));
      }
    } else if (view === 'list') {
      const nav = (data.nav || []).find((n) => n.key === navKey) || {};
      title = `${strip(nav.title) || strip(nav.label) || navKey}${team ? ` · ${team}` : ''}`;
      desc = strip(nav.intro).slice(0, 200);
      canonical = urlFor.list(navKey);
    } else {
      desc = strip(data.home?.intro) || desc;
      desc = desc.slice(0, 200);
    }

    document.title = title;
    set('meta[name="description"]', 'content', desc);
    set('meta[property="og:title"]', 'content', title);
    set('meta[property="og:description"]', 'content', desc);
    if (image) set('meta[property="og:image"]', 'content', new URL(image, location.href).href);
    set('link[rel="canonical"]', 'href', `${location.origin}${canonical}`);
  }

  /* ------------------------------------------------------------ header 装配 */
  /** 主导航每次切视图都要重画（要更新 aria-current），所以单独一个函数 */
  function renderNav(data, route, go) {
    const nav = $('#header-nav');
    nav.innerHTML = '';
    (data.nav || []).forEach((n) => {
      const active = route.navKey === n.key;
      const a = el('a', {
        href: urlFor.list(n.key),
        'aria-current': active ? 'page' : null,
      }, esc(t(n.label)));
      a.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        go({ view: 'list', navKey: n.key });
      });
      nav.append(a);
    });
  }

  /** 品牌名和页脚的文字。切语言要重画，所以和下面的一次性绑定分开。 */
  function renderChromeText(data) {
    const site = data.site || {};
    const team = t(site.team) || 'Team';
    if (site.logo) $('#brand-logo').src = site.logo;
    $('#brand-full').textContent = team;
    $('#brand-short').textContent = t(site.teamShort) || team.slice(0, 8);

    const f = site.footer || {};
    $('#footer-team').textContent = team;
    $('#footer-note').textContent = t(f.note) || t(site.tagline) || '';
    $('#footer-credit').textContent = t(f.credit) || '';
    const fl = $('#footer-links');
    fl.innerHTML = '';
    [...(site.links || []),
     ...(f.contact ? [{ label: ui('contact'), href: f.contact }] : [])]
      .forEach((l) => fl.append(el('a', { href: l.href }, esc(t(l.label)))));
  }

  /** 只需要装一次的东西：logo 缺失时移除、品牌链接的点击路由 */
  function initChrome(data, go) {
    if (!data.site?.logo) $('#brand-logo').remove();
    const home = $('#brand-link');
    home.href = urlFor.home();
    home.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      go({ view: 'home' });
    });
  }

  /* ------------------------------------------------------------ 主渲染流程 */
  function render(data, route, { pushState = false, scrollTop = true } = {}) {
    const go = (next, opts) => render(data, next, { pushState: true, ...opts });

    if (pushState) {
      const url = route.view === 'detail' ? urlFor.detail(route.item.id)
                : route.view === 'list'   ? urlFor.list(route.navKey)
                : urlFor.home();
      history.pushState(null, '', url);
    }

    updateMeta(data, route);
    renderChromeText(data);
    renderNav(data, route, go);

    const hero = $('#hero');
    const main = $('#sections');
    if (activeAstraViewer) {
      activeAstraViewer.dispose();
      activeAstraViewer = null;
    }
    main.innerHTML = '';

    // 切换器只在详情页出现
    const switcher = $('#switcher');
    switcher.hidden = route.view !== 'detail';

    if (route.view === 'home') {
      renderHomeHero(data, hero);
      renderHomeSections(data, main, go);
      renderToc([]);
    } else if (route.view === 'list') {
      renderListHero(data, route.navKey, hero);
      renderList(data, route.navKey, main, go);
      renderToc([]);
    } else {
      renderDetail(data, route, hero, main, go);
    }

    initCompare(main);
    initAstraGallery(main);
    initLightbox(main);
    initCopy(main);
    initReveal(document);
    initTocHighlight();
    document.dispatchEvent(new CustomEvent('mira:content-rendered', { detail: { view: route.view } }));

    if (scrollTop) window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /** 详情页：hero + abstract + sections + bibtex + TOC + 切换器 */
  function renderDetail(data, route, hero, main, go) {
    const p = route.item;
    renderHero(p, hero, { data, navKey: route.navKey, go });

    const tocEntries = [];
    const abs = renderAbstract(p);
    if (abs) { main.append(abs); tocEntries.push({ id: 'abstract', label: ui('abstract') }); }

    (p.sections || []).forEach((s, i) => {
      const node = renderSection(s, i + (abs ? 1 : 0));
      if (!node) return;
      main.append(node);
      if (s.title) tocEntries.push({ id: node.id, label: t(s.title) });
    });

    const bib = renderBibtex(p);
    if (bib) { main.append(bib); tocEntries.push({ id: 'bibtex', label: ui('bibtex') }); }

    renderToc(tocEntries);
    // 切换器只列出同栏目的条目：research 项目之间互切，blog 文章之间互切
    initSwitcher(data, route.navKey, p, (id) => {
      const found = findItem(data, id);
      if (found) go({ view: 'detail', ...found });
    });
  }

  /* ------------------------------------------------------------------ boot */
  async function boot() {
    let data;
    try {
      data = await loadData();
    } catch (err) {
      $('#hero').innerHTML =
        '<div class="wrap"><div class="prose" style="padding:4rem 0">' +
        `<h1 class="section__title">${esc(ui('loadFailTitle'))}</h1>` +
        `<p style="color:var(--text-muted)">${ui('loadFailBody')}</p></div></div>`;
      console.error(err);
      return;
    }

    if (!data.projects?.length && !data.posts?.length) {
      $('#hero').innerHTML =
        `<div class="wrap"><p style="padding:4rem 0">${esc(ui('noContent'))}</p></div>`;
      return;
    }

    const go = (next, opts) => render(data, next, { pushState: true, ...opts });
    initChrome(data, go);
    initScrollChrome();
    initTheme();
    // 切语言：原地重画当前视图，不动 URL 也不跳回顶部
    initLang(() => render(data, parseRoute(data), { scrollTop: false }));

    render(data, parseRoute(data), { scrollTop: false });

    window.addEventListener('popstate', () => {
      render(data, parseRoute(data), { scrollTop: false });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

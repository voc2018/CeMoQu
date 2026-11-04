async function loadHeader() {
    const container = document.getElementById('header-container');
    const base = container?.dataset?.base || '../';

    const response = await fetch(base + 'shared/header.html?v=20261103-3');
    const text = await response.text();
    container.innerHTML = text;

    // root 페이지일 경우 nav 링크 보정
    if (base === './') {
        document.getElementById('nav-home').href = './index.html';
        document.getElementById('nav-sd').href   = './SD/index.html';
        document.getElementById('nav-rt').href   = './RT/index.html';
        document.getElementById('nav-ld').href   = './LD/index.html';
        document.getElementById('nav-st').href   = './ST/index.html';
    }

    setupPersistence();
    setCurrentDate();
    setupHeaderOffset();
    window.dispatchEvent(new Event('cemoqu-header-ready'));
}

function setupHeaderOffset() {
    const header = document.querySelector('.global-header');
    if (!header) return;

    const applyOffset = () => {
        const height = header.offsetHeight;
        document.documentElement.style.setProperty('--header-offset', (height + 30) + 'px');
    };

    applyOffset();

    // 헤더가 좁은 화면에서 줄바꿈되면 높이가 바뀌므로, 리사이즈마다 다시 잼
    window.addEventListener('resize', applyOffset);

    // 헤더 내부 콘텐츠 변경(예: input 값 변화로 인한 줄바꿈)도 감지
    if (window.ResizeObserver) {
        new ResizeObserver(applyOffset).observe(header);
    }
}

/* Values saved by older versions, which accepted free text. */
const LEGACY_SEX = { f: 'Female', female: 'Female', m: 'Male', male: 'Male', other: 'Other' };

function setupPersistence() {
    const fields = ['glob-id', 'glob-name', 'glob-age', 'glob-dob', 'glob-sex', 'glob-hand', 'glob-sess', 'glob-op'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        let saved = localStorage.getItem(id);
        if (id === 'glob-sex' && saved) saved = LEGACY_SEX[saved.trim().toLowerCase()] || '';
        if (id === 'glob-age' && saved) saved = wholeAge(saved);
        if (saved) el.value = saved;
        const save = () => localStorage.setItem(id, el.value);
        el.addEventListener('input', save);
        el.addEventListener('change', save);
    });
    const age = document.getElementById('glob-age');
    age.addEventListener('input', () => {
        const clean = wholeAge(age.value);
        if (clean !== age.value) age.value = clean;
    });
}

/* Age accepts whole numbers from 0 to 120 only. */
function wholeAge(value) {
    const digits = String(value).replace(/\D/g, '');
    if (!digits) return '';
    return String(Math.min(120, Number(digits)));
}

function setCurrentDate() {
    const dateEl = document.getElementById('glob-date');
    if (!dateEl) return;
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    dateEl.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/* Clicking a trajectory thumbnail shows the full-size image. */
function setupImageViewer() {
    document.addEventListener('click', event => {
        const link = event.target.closest?.('a.trajectory-thumb-link');
        if (!link) return;
        event.preventDefault();
        const viewer = document.createElement('div');
        viewer.className = 'gh-image-viewer';
        viewer.setAttribute('role', 'dialog');
        viewer.setAttribute('aria-label', 'Trajectory image');
        const image = document.createElement('img');
        image.src = link.href;
        image.alt = link.querySelector('img')?.alt || 'Trajectory image';
        const actions = document.createElement('div');
        actions.className = 'gh-image-actions';
        const download = document.createElement('a');
        download.href = link.href;
        download.download = link.getAttribute('download') || 'trajectory.png';
        download.textContent = 'Download';
        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = 'Close';
        actions.append(download, close);
        viewer.append(image, actions);
        const shut = () => {
            viewer.remove();
            document.removeEventListener('keydown', onKey);
        };
        const onKey = e => { if (e.key === 'Escape') shut(); };
        close.addEventListener('click', shut);
        viewer.addEventListener('click', e => { if (e.target === viewer) shut(); });
        document.addEventListener('keydown', onKey);
        (document.fullscreenElement || document.body).appendChild(viewer);
    });
}

window.addEventListener('DOMContentLoaded', () => {
    setupImageViewer();
    loadHeader();
});

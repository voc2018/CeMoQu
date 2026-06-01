async function loadHeader() {
    const container = document.getElementById('header-container');
    const base = container?.dataset?.base || '../';

    const response = await fetch(base + 'shared/header.html');
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
}

function setupPersistence() {
    const fields = ['glob-id', 'glob-name', 'glob-age', 'glob-sex', 'glob-sess', 'glob-op'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (localStorage.getItem(id)) el.value = localStorage.getItem(id);
        el.addEventListener('input', () => localStorage.setItem(id, el.value));
    });
}

function setCurrentDate() {
    const dateEl = document.getElementById('glob-date');
    if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
}

window.addEventListener('DOMContentLoaded', loadHeader);

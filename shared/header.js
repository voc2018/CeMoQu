async function loadHeader() {
    const response = await fetch('../shared/header.html'); // Adjust path as needed
    const text = await response.text();
    document.getElementById('header-container').innerHTML = text;

    setupPersistence();
    setCurrentDate();
}

function setupPersistence() {
    const fields = ['glob-id', 'glob-name', 'glob-age', 'glob-sex', 'glob-sess', 'glob-op'];
    
    fields.forEach(id => {
        const el = document.getElementById(id);
        // Load existing data
        if (localStorage.getItem(id)) el.value = localStorage.getItem(id);
        
        // Save data on change
        el.addEventListener('input', () => {
            localStorage.setItem(id, el.value);
        });
    });
}

function setCurrentDate() {
    const dateEl = document.getElementById('glob-date');
    if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
}

window.addEventListener('DOMContentLoaded', loadHeader);
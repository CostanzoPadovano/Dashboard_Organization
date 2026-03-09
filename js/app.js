// ============================================================
// BioTracker — app.js
// Entry point, inizializzazione, utilities globali
// ============================================================

const App = (() => {
    async function init() {
        try {
            // Mostriamo un log o prepariamo la UI...
            console.log('⏳ Connessione al database in corso...');
            
            // Aspettiamo che Firebase scarichi la lavagna (o carichi dal DB locale le prime volte)
            await Storage.initCloud();
        } catch(e) {
            console.error("Errore di connessione a Firebase:", e);
        }

        Board.init();
        Search.init();
        updateStats();
        setupImportExport();
        setupKeyboardShortcuts();
        registerServiceWorker();

        // Tooltip
        console.log('%c🧬 BioTracker Sincronizzato & Attivo', 'color: #3fb950; font-size: 14px; font-weight: bold;');
    }

    function updateStats() {
        const stats = Storage.getStats();
        const el = document.getElementById('stats-bar');
        if (el) {
            el.innerHTML = `
                <span class="stat" title="Card attive">📊 ${stats.active} attive</span>
                <span class="stat" title="In archivio">📦 ${stats.archived} archiviate</span>
                ${stats.byPriority.critical > 0 ? `<span class="stat stat-critical" title="Priorità critica">🔴 ${stats.byPriority.critical}</span>` : ''}
                ${stats.byPriority.high > 0 ? `<span class="stat stat-high" title="Priorità alta">🟠 ${stats.byPriority.high}</span>` : ''}
            `;
        }
    }

    function setupImportExport() {
        const exportBtn = document.getElementById('btn-export');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                Storage.exportJSON();
                showToast('Backup esportato!', 'success');
            });
        }

        const importBtn = document.getElementById('btn-import');
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                document.getElementById('file-import').click();
            });
        }

        const fileInput = document.getElementById('file-import');
        if (fileInput) {
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                try {
                    await Storage.importJSON(file);
                    Board.renderBoard();
                    Board.refreshAllColumns();
                    updateStats();
                    showToast('Dati importati con successo!', 'success');
                } catch (err) {
                    showToast('Errore: ' + err.message, 'error');
                }
                fileInput.value = '';
            });
        }
    }

    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Esc to close modal or archive
            if (e.key === 'Escape') {
                const modal = document.getElementById('card-modal');
                if (modal && modal.style.display === 'block') {
                    Card.closeModal();
                    return;
                }
                Archive.close();
            }

            // Ctrl+K or Cmd+K to focus search
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                const searchInput = document.getElementById('global-search');
                if (searchInput) searchInput.focus();
            }

            // Ctrl+E to export
            if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
                e.preventDefault();
                Storage.exportJSON();
                showToast('Backup esportato!', 'success');
            }
        });
    }

    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}</span>
            <span class="toast-message">${message}</span>
        `;

        container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => toast.classList.add('show'));

        // Auto remove
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('Service Worker registrato:', reg.scope))
                .catch(err => console.log('Service Worker non registrato:', err));
        }
    }

    return {
        init, updateStats, showToast
    };
})();

// ----- Bootstrap -----
document.addEventListener('DOMContentLoaded', App.init);

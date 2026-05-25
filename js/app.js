// ============================================================
// BioTracker - app.js
// Entry point, inizializzazione, utilities globali
// ============================================================

const App = (() => {
    let appStarted = false;

    async function init() {
        console.log('⏳ Verifica Autenticazione in corso...');

        const loginOverlay = document.getElementById('login-overlay');
        const btnLogin = document.getElementById('btn-login-google');

        if (btnLogin) {
            btnLogin.addEventListener('click', () => {
                const provider = new firebase.auth.GoogleAuthProvider();
                firebase.auth().signInWithPopup(provider).catch(err => {
                    console.error('Errore login:', err);
                    showToast('Errore durante il login: ' + err.message, 'error');
                });
            });
        }

        firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                console.log('👤 Utente loggato:', user.email);
                if (loginOverlay) loginOverlay.style.display = 'none';
                await startApp();
            } else {
                console.log('🔒 Utente non loggato. Mostro schermata di login.');
                if (loginOverlay) loginOverlay.style.display = 'flex';
            }
        });
    }

    async function startApp() {
        if (appStarted) return;
        appStarted = true;

        try {
            console.log('⏳ Connessione al database in corso...');
            await Storage.initCloud();
        } catch (e) {
            appStarted = false;
            console.error('Errore di connessione a Firebase:', e);
            showToast('Firebase non disponibile: app bloccata per proteggere i dati.', 'error');
            return;
        }

        Board.init();
        Search.init();
        updateStats();
        setupImportExport();
        setupKeyboardShortcuts();
        registerServiceWorker();

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

    async function runExport() {
        try {
            await Storage.exportJSON();
            showToast('Backup JSON esportato!', 'success');
        } catch (err) {
            console.error('Errore export:', err);
            showToast('Errore export: ' + err.message, 'error');
        }
    }

    async function runCloudBackup(button = null) {
        if (button) button.disabled = true;
        try {
            const result = await Storage.createBackup('manual');
            if (result.cloudPath) {
                showToast('Backup cloud creato!', 'success');
            } else {
                showToast('Backup locale creato. Cloud non disponibile.', 'warning');
            }
        } catch (err) {
            console.error('Errore backup:', err);
            showToast('Errore backup: ' + err.message, 'error');
        } finally {
            if (button) button.disabled = false;
        }
    }

    function setupImportExport() {
        const exportBtn = document.getElementById('btn-export');
        if (exportBtn) {
            exportBtn.addEventListener('click', runExport);
        }

        const cloudBackupBtn = document.getElementById('btn-cloud-backup');
        if (cloudBackupBtn) {
            cloudBackupBtn.addEventListener('click', () => runCloudBackup(cloudBackupBtn));
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
                    await Storage.createBackup('before-import');
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
            if (e.key === 'Escape') {
                const modal = document.getElementById('card-modal');
                if (modal && modal.style.display === 'block') {
                    Card.closeModal();
                    return;
                }
                Archive.close();
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                const searchInput = document.getElementById('global-search');
                if (searchInput) searchInput.focus();
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
                e.preventDefault();
                runExport();
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
        requestAnimationFrame(() => toast.classList.add('show'));

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

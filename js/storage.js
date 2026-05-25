// ============================================================
// BioTracker - storage.js
// Persistenza dati in Firestore + backup locale/cloud + Import/Export JSON
// ============================================================

const Storage = (() => {
    const STORAGE_KEY = 'biotracker_data';
    const BACKUP_INDEX_KEY = 'biotracker_backup_index';
    const LEGACY_BOARD_ID = 'default';
    const AUTO_BACKUP_INTERVAL_MS = 5 * 60 * 1000;

    function createDefaultData() {
        return {
            projects: [{
                id: 'default',
                name: 'BioTracker',
                description: 'Gestione analisi bioinformatiche',
                createdAt: new Date().toISOString(),
                columns: ['backlog', 'in_progress', 'review', 'done']
            }],
            cards: [],
            settings: {
                theme: 'dark',
                lastExport: null
            }
        };
    }

    const COLUMN_META = {
        backlog: { name: '📋 Backlog', color: '#8b949e' },
        in_progress: { name: '🔬 In Corso', color: '#58a6ff' },
        review: { name: '📊 In Revisione', color: '#d29922' },
        done: { name: '✅ Completato', color: '#3fb950' }
    };

    const PRIORITIES = {
        critical: { label: 'Critica', color: '#f85149', emoji: '🔴', order: 0 },
        high:     { label: 'Alta',    color: '#f0883e', emoji: '🟠', order: 1 },
        medium:   { label: 'Media',   color: '#d29922', emoji: '🟡', order: 2 },
        low:      { label: 'Bassa',   color: '#3fb950', emoji: '🟢', order: 3 }
    };

    const PIPELINES = [
        'RNA-seq', 'WGS', 'WES', 'ChIP-seq', 'ATAC-seq',
        'Methylation', 'Metagenomica', 'Proteomica',
        'Single-cell', 'Long-read', 'Variant Calling',
        'Gene Expression', 'Pathway Analysis', 'Altro'
    ];

    let memoryData = null;
    let lastCloudData = null;
    let cloudReady = false;
    let userDocRef = null;
    let unsubscribeCloud = null;
    let saveQueue = Promise.resolve();
    let lastAutoBackupAt = 0;
    let initialBackupCreated = false;

    function clone(data) {
        return JSON.parse(JSON.stringify(data));
    }

    function isValidData(data) {
        return !!data &&
            Array.isArray(data.projects) &&
            Array.isArray(data.cards) &&
            data.settings &&
            typeof data.settings === 'object';
    }

    function normalizeData(data) {
        const defaults = createDefaultData();
        const normalized = clone(data);
        normalized.projects = Array.isArray(normalized.projects) && normalized.projects.length
            ? normalized.projects
            : defaults.projects;
        normalized.cards = Array.isArray(normalized.cards) ? normalized.cards : [];
        normalized.settings = normalized.settings && typeof normalized.settings === 'object'
            ? { ...defaults.settings, ...normalized.settings }
            : defaults.settings;
        return normalized;
    }

    function countCards(data) {
        return isValidData(data) ? data.cards.length : 0;
    }

    function hasCards(data) {
        return countCards(data) > 0;
    }

    function timestampId() {
        return new Date().toISOString().replace(/[:.]/g, '-');
    }

    function getAppApi() {
        try {
            if (typeof App !== 'undefined') return App;
        } catch (e) {}
        return window.App;
    }

    function getBoardApi() {
        try {
            if (typeof Board !== 'undefined') return Board;
        } catch (e) {}
        return window.Board;
    }

    function notify(message, type = 'info') {
        const appApi = getAppApi();
        if (appApi && typeof appApi.showToast === 'function') {
            appApi.showToast(message, type);
        }
    }

    function persistLocalMirror(data) {
        if (!isValidData(data)) return false;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            return true;
        } catch (error) {
            console.warn('Backup locale non salvato:', error);
            return false;
        }
    }

    function readLocalData(key = STORAGE_KEY) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return isValidData(parsed) ? normalizeData(parsed) : null;
        } catch (error) {
            console.warn('Backup locale non leggibile:', error);
            return null;
        }
    }

    function readLatestLocalBackupWithCards() {
        try {
            const index = JSON.parse(localStorage.getItem(BACKUP_INDEX_KEY) || '[]');
            for (const entry of index) {
                const backup = readLocalData(entry.key);
                if (backup && hasCards(backup)) return backup;
            }
        } catch (error) {
            console.warn('Indice backup locale non leggibile:', error);
        }
        return null;
    }

    function writeLocalBackup(sourceData, reason = 'manual') {
        if (!isValidData(sourceData)) return null;

        try {
            const now = new Date().toISOString();
            const key = `biotracker_backup_${timestampId()}_${Math.random().toString(36).slice(2, 8)}`;
            const backup = normalizeData(sourceData);
            backup.settings = {
                ...backup.settings,
                backupCreatedAt: now,
                backupReason: reason,
                backupCardCount: countCards(sourceData)
            };

            localStorage.setItem(key, JSON.stringify(backup));

            const index = JSON.parse(localStorage.getItem(BACKUP_INDEX_KEY) || '[]');
            index.unshift({
                key,
                createdAt: now,
                reason,
                cardCount: countCards(sourceData)
            });

            localStorage.setItem(BACKUP_INDEX_KEY, JSON.stringify(index.slice(0, 25)));
            return key;
        } catch (error) {
            console.warn('Creazione backup locale fallita:', error);
            return null;
        }
    }

    async function writeCloudBackup(sourceData, reason = 'manual', sourcePath = null) {
        const user = firebase.auth().currentUser;
        if (!db || !user || !isValidData(sourceData)) return null;

        const id = `${timestampId()}_${Math.random().toString(36).slice(2, 8)}`;
        const now = new Date().toISOString();
        const payload = {
            createdAt: now,
            reason,
            source: sourcePath || (userDocRef ? userDocRef.path : `boards/${user.uid}`),
            cardCount: countCards(sourceData),
            data: normalizeData(sourceData)
        };

        const backupRefs = [
            db.collection('boards').doc(user.uid).collection('backups').doc(id),
            db.collection('board_backups').doc(user.uid).collection('snapshots').doc(id)
        ];

        let lastError = null;
        for (const backupRef of backupRefs) {
            try {
                await backupRef.set(payload);
                return backupRef.path;
            } catch (error) {
                lastError = error;
            }
        }

        throw lastError || new Error('Backup cloud non riuscito');
    }

    async function createBackup(reason = 'manual') {
        if (!cloudReady || !memoryData) {
            throw new Error('Dati cloud non ancora caricati: backup annullato.');
        }

        const data = normalizeData(memoryData);
        const localKey = writeLocalBackup(data, reason);
        let cloudPath = null;
        let cloudError = null;

        try {
            cloudPath = await writeCloudBackup(data, reason);
        } catch (error) {
            cloudError = error;
            console.warn('Backup cloud fallito, backup locale disponibile:', error);
        }

        if (!localKey && !cloudPath) {
            throw cloudError || new Error('Backup non creato.');
        }

        return { localKey, cloudPath, cloudError };
    }

    async function createStartupBackupIfNeeded() {
        if (initialBackupCreated || !hasCards(memoryData)) return;
        initialBackupCreated = true;
        writeLocalBackup(memoryData, 'startup');
        try {
            await writeCloudBackup(memoryData, 'startup');
        } catch (error) {
            console.warn('Backup cloud iniziale non creato:', error);
        }
    }

    async function getLegacyFirestoreData() {
        try {
            const legacySnap = await db.collection('boards').doc(LEGACY_BOARD_ID).get();
            if (!legacySnap.exists) return null;
            const legacyData = legacySnap.data();
            return isValidData(legacyData) && hasCards(legacyData)
                ? normalizeData(legacyData)
                : null;
        } catch (error) {
            console.warn('Lettura documento legacy boards/default non riuscita:', error);
            return null;
        }
    }

    async function recoverIfEmpty(currentData, docRef) {
        if (hasCards(currentData)) return currentData;

        const recoveries = [
            { source: 'boards/default', data: await getLegacyFirestoreData() },
            { source: 'localStorage:biotracker_data', data: readLocalData(STORAGE_KEY) },
            { source: 'localStorage:biotracker_backup_index', data: readLatestLocalBackupWithCards() }
        ];

        const recovery = recoveries.find(item => item.data && hasCards(item.data));
        if (!recovery) return currentData;

        const recovered = normalizeData(recovery.data);
        recovered.settings = {
            ...recovered.settings,
            recoveredFrom: recovery.source,
            recoveredAt: new Date().toISOString()
        };

        writeLocalBackup(currentData, `before-recovery-from-${recovery.source}`);
        await docRef.set(recovered);
        notify(`Dati recuperati da ${recovery.source}`, 'success');
        return recovered;
    }

    async function loadInitialData(docRef) {
        const snapshot = await docRef.get();
        let initialData;

        if (snapshot.exists) {
            const cloudData = snapshot.data();
            if (!isValidData(cloudData)) {
                throw new Error('Documento Firestore non valido: salvataggio bloccato.');
            }
            initialData = normalizeData(cloudData);
        } else {
            const legacyData = await getLegacyFirestoreData();
            initialData = legacyData || readLocalData(STORAGE_KEY) || readLatestLocalBackupWithCards() || createDefaultData();
            initialData = normalizeData(initialData);
            if (legacyData && hasCards(legacyData)) {
                initialData.settings = {
                    ...initialData.settings,
                    migratedFrom: 'boards/default',
                    migratedAt: new Date().toISOString()
                };
            }
            await docRef.set(initialData);
        }

        return recoverIfEmpty(initialData, docRef);
    }

    function rerenderApp() {
        const boardApi = getBoardApi();
        const appApi = getAppApi();

        if (boardApi && typeof boardApi.renderBoard === 'function') {
            try {
                boardApi.renderBoard();
                if (appApi && typeof appApi.updateStats === 'function') appApi.updateStats();
            } catch (error) {
                console.warn('Re-render dopo sync cloud non riuscito:', error);
            }
        }
    }

    async function initCloud() {
        const user = firebase.auth().currentUser;
        if (!user) {
            throw new Error('Nessun utente loggato');
        }

        cloudReady = false;
        userDocRef = db.collection('boards').doc(user.uid);

        if (unsubscribeCloud) {
            unsubscribeCloud();
            unsubscribeCloud = null;
        }

        const initialData = await loadInitialData(userDocRef);
        memoryData = normalizeData(initialData);
        lastCloudData = clone(memoryData);
        cloudReady = true;
        persistLocalMirror(memoryData);
        createStartupBackupIfNeeded();

        unsubscribeCloud = userDocRef.onSnapshot((doc) => {
            if (!doc.exists) {
                console.warn('Documento board eliminato dal cloud. Mantengo la copia in memoria e blocco i salvataggi.');
                cloudReady = false;
                notify('Board cloud mancante: salvataggi bloccati per sicurezza.', 'error');
                return;
            }

            const incoming = doc.data();
            if (!isValidData(incoming)) {
                console.warn('Documento board non valido ricevuto dal cloud. Aggiornamento ignorato.');
                return;
            }

            memoryData = normalizeData(incoming);
            lastCloudData = clone(memoryData);
            persistLocalMirror(memoryData);
            rerenderApp();
        }, (error) => {
            console.error('Errore listener Firebase:', error);
            cloudReady = false;
            notify('Connessione Firebase persa: salvataggi bloccati per sicurezza.', 'error');
        });
    }

    function load() {
        if (!cloudReady || !memoryData || !isValidData(memoryData)) {
            console.warn('Storage.load() chiamato prima del caricamento cloud. Uso solo fallback temporaneo.');
            return createDefaultData();
        }
        return memoryData;
    }

    function shouldBlockSave(existingData, nextData, reason) {
        if (!existingData || !isValidData(existingData)) return false;

        const existingCount = countCards(existingData);
        const nextCount = countCards(nextData);
        const intentionalEmptyReasons = ['delete-card'];

        return existingCount > 0 &&
            nextCount === 0 &&
            !intentionalEmptyReasons.includes(reason);
    }

    async function backupBeforeWrite(existingData, nextData, reason) {
        if (!existingData || !hasCards(existingData)) return;

        const existingCount = countCards(existingData);
        const nextCount = countCards(nextData);
        const riskyReasons = ['delete-card', 'import-json'];
        const risky = nextCount < existingCount || riskyReasons.includes(reason);
        const backupDue = Date.now() - lastAutoBackupAt > AUTO_BACKUP_INTERVAL_MS;

        if (!risky && !backupDue) return;

        writeLocalBackup(existingData, `before-${reason}`);
        lastAutoBackupAt = Date.now();

        try {
            await writeCloudBackup(existingData, `before-${reason}`);
        } catch (error) {
            console.warn('Backup cloud prima del salvataggio non creato:', error);
        }
    }

    function save(data, reason = 'save') {
        try {
            if (!cloudReady || !userDocRef) {
                notify('Salvataggio bloccato: dati cloud non ancora caricati.', 'error');
                return false;
            }

            if (!isValidData(data)) {
                notify('Salvataggio bloccato: struttura dati non valida.', 'error');
                return false;
            }

            const nextData = normalizeData(data);
            nextData.settings = {
                ...nextData.settings,
                lastSaved: new Date().toISOString()
            };

            if (shouldBlockSave(lastCloudData, nextData, reason)) {
                writeLocalBackup(lastCloudData, `blocked-${reason}`);
                notify('Salvataggio vuoto bloccato: esisteva una board con card.', 'error');
                return false;
            }

            memoryData = nextData;
            persistLocalMirror(nextData);

            saveQueue = saveQueue.then(async () => {
                const snapshot = await userDocRef.get();
                const existingData = snapshot.exists && isValidData(snapshot.data())
                    ? normalizeData(snapshot.data())
                    : lastCloudData;

                if (shouldBlockSave(existingData, nextData, reason)) {
                    writeLocalBackup(existingData, `blocked-${reason}`);
                    throw new Error('Salvataggio vuoto bloccato: esisteva una board con card.');
                }

                await backupBeforeWrite(existingData, nextData, reason);
                await userDocRef.set(nextData);
                lastCloudData = clone(nextData);
            }).catch((error) => {
                console.error('Errore salvataggio dati:', error);
                notify(error.message || 'Errore durante il salvataggio cloud.', 'error');
            });

            return true;
        } catch (error) {
            console.error('Errore salvataggio dati:', error);
            notify('Errore durante il salvataggio.', 'error');
            return false;
        }
    }

    // ----- Card Operations -----

    function generateId() {
        return 'card_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    function createCard({ title, description = '', priority = 'medium', columnId = 'backlog',
                          pipeline = '', organism = '', dataset = '', tags = [], notes = '' }) {
        const data = load();
        const cardsInColumn = data.cards.filter(c => c.columnId === columnId && !c.archived);
        const card = {
            id: generateId(),
            projectId: 'default',
            columnId,
            title,
            description,
            priority,
            pipeline,
            organism,
            dataset,
            tags: Array.isArray(tags) ? tags : [],
            notes,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            archived: false,
            archivedAt: null,
            order: cardsInColumn.length
        };
        data.cards.push(card);
        save(data, 'create-card');
        return card;
    }

    function updateCard(cardId, updates) {
        const data = load();
        const idx = data.cards.findIndex(c => c.id === cardId);
        if (idx === -1) return null;
        Object.assign(data.cards[idx], updates, { updatedAt: new Date().toISOString() });
        save(data, 'update-card');
        return data.cards[idx];
    }

    function deleteCard(cardId) {
        const data = load();
        data.cards = data.cards.filter(c => c.id !== cardId);
        save(data, 'delete-card');
    }

    function getCard(cardId) {
        const data = load();
        return data.cards.find(c => c.id === cardId) || null;
    }

    function getCards(columnId, includeArchived = false) {
        const data = load();
        return data.cards
            .filter(c => c.columnId === columnId && (includeArchived || !c.archived))
            .sort((a, b) => a.order - b.order);
    }

    function getAllActiveCards() {
        const data = load();
        return data.cards.filter(c => !c.archived);
    }

    function moveCard(cardId, targetColumnId, targetOrder) {
        const data = load();
        const card = data.cards.find(c => c.id === cardId);
        if (!card) return;

        const oldColumnId = card.columnId;
        card.columnId = targetColumnId;
        card.updatedAt = new Date().toISOString();

        const targetCards = data.cards
            .filter(c => c.columnId === targetColumnId && !c.archived && c.id !== cardId)
            .sort((a, b) => a.order - b.order);

        targetCards.splice(targetOrder, 0, card);
        targetCards.forEach((c, i) => c.order = i);

        if (oldColumnId !== targetColumnId) {
            const oldCards = data.cards
                .filter(c => c.columnId === oldColumnId && !c.archived)
                .sort((a, b) => a.order - b.order);
            oldCards.forEach((c, i) => c.order = i);
        }

        save(data, 'move-card');
    }

    // ----- Archive -----

    function archiveCard(cardId) {
        return updateCard(cardId, {
            archived: true,
            archivedAt: new Date().toISOString()
        });
    }

    function restoreCard(cardId) {
        const data = load();
        const card = data.cards.find(c => c.id === cardId);
        if (!card) return null;

        const backlogCards = data.cards.filter(c => c.columnId === 'backlog' && !c.archived);
        card.archived = false;
        card.archivedAt = null;
        card.columnId = 'backlog';
        card.order = backlogCards.length;
        card.updatedAt = new Date().toISOString();
        save(data, 'restore-card');
        return card;
    }

    function getArchivedCards() {
        const data = load();
        return data.cards
            .filter(c => c.archived)
            .sort((a, b) => new Date(b.archivedAt) - new Date(a.archivedAt));
    }

    // ----- Import/Export -----

    async function exportJSON() {
        const data = normalizeData(load());
        data.settings.lastExport = new Date().toISOString();

        try {
            await createBackup('export-json');
        } catch (error) {
            console.warn('Backup automatico durante export non creato:', error);
        }

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `biotracker_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function importJSON(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const imported = JSON.parse(e.target.result);
                    if (!imported.cards || !imported.projects) {
                        reject(new Error('File non valido: mancano campi obbligatori'));
                        return;
                    }
                    save(normalizeData(imported), 'import-json');
                    resolve(imported);
                } catch (err) {
                    reject(new Error('Errore parsing JSON: ' + err.message));
                }
            };
            reader.onerror = () => reject(new Error('Errore lettura file'));
            reader.readAsText(file);
        });
    }

    // ----- Search -----

    function searchCards(query, includeArchived = true) {
        const data = load();
        const q = query.toLowerCase().trim();
        if (!q) return includeArchived ? data.cards : data.cards.filter(c => !c.archived);

        return data.cards.filter(c => {
            if (!includeArchived && c.archived) return false;
            return (
                c.title.toLowerCase().includes(q) ||
                c.description.toLowerCase().includes(q) ||
                c.pipeline.toLowerCase().includes(q) ||
                c.organism.toLowerCase().includes(q) ||
                c.dataset.toLowerCase().includes(q) ||
                c.notes.toLowerCase().includes(q) ||
                c.tags.some(t => t.toLowerCase().includes(q))
            );
        });
    }

    function filterCards(filters) {
        const data = load();
        return data.cards.filter(c => {
            if (c.archived) return false;
            if (filters.priority && c.priority !== filters.priority) return false;
            if (filters.pipeline && c.pipeline !== filters.pipeline) return false;
            if (filters.columnId && c.columnId !== filters.columnId) return false;
            return true;
        });
    }

    // ----- Stats -----

    function getStats() {
        const data = load();
        const active = data.cards.filter(c => !c.archived);
        const archived = data.cards.filter(c => c.archived);
        return {
            total: data.cards.length,
            active: active.length,
            archived: archived.length,
            byColumn: {
                backlog: active.filter(c => c.columnId === 'backlog').length,
                in_progress: active.filter(c => c.columnId === 'in_progress').length,
                review: active.filter(c => c.columnId === 'review').length,
                done: active.filter(c => c.columnId === 'done').length
            },
            byPriority: {
                critical: active.filter(c => c.priority === 'critical').length,
                high: active.filter(c => c.priority === 'high').length,
                medium: active.filter(c => c.priority === 'medium').length,
                low: active.filter(c => c.priority === 'low').length
            }
        };
    }

    // ----- Public API -----

    return {
        initCloud,
        load, save,
        createBackup,
        COLUMN_META, PRIORITIES, PIPELINES,
        createCard, updateCard, deleteCard, getCard,
        getCards, getAllActiveCards, moveCard,
        archiveCard, restoreCard, getArchivedCards,
        exportJSON, importJSON,
        searchCards, filterCards,
        getStats
    };
})();

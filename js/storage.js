// ============================================================
// BioTracker — storage.js
// Persistenza dati in localStorage + Import/Export JSON
// ============================================================

const Storage = (() => {
    const STORAGE_KEY = 'biotracker_data';

    const DEFAULT_DATA = {
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

    // Variabile in memoria tenuta sempre sincronizzata con Firestore
    let memoryData = null;

    function initCloud() {
        return new Promise((resolve, reject) => {
            try {
                const user = firebase.auth().currentUser;
                if (!user) {
                    console.error("Blocco Storage init() perché non risulta alcun utente autenticato.");
                    reject(new Error("Nessun utente loggato"));
                    return;
                }
                
                // Riferimento al documento personale della collezione "boards" (PRIVATO per questo user)
                const docRef = db.collection('boards').doc(user.uid);
                
                // Listener real-time: scatta al primo caricamento e ad ogni modifica nel cloud
                docRef.onSnapshot((doc) => {
                    if (doc.exists) {
                        memoryData = doc.data();
                    } else {
                        // Se non esiste nel cloud, lo creiamo col default
                        memoryData = JSON.parse(JSON.stringify(DEFAULT_DATA));
                        docRef.set(memoryData).catch(console.error);
                    }
                    
                    // Se l'app è già inizializzata e riceviamo un aggiornamento (es. da un altro dispositivo)
                    // forziamo il re-render della UI per mostrare i dati aggiornati in tempo reale!
                    if (window.Board && typeof window.Board.renderBoard === 'function') {
                        try {
                            // Salviamo lo stato di eventuali drag n drop per non interromperli, se possibile
                            // ma per sicurezza ricarichiamo tutto
                            window.Board.renderBoard();
                            if (window.App && window.App.updateStats) window.App.updateStats();
                        } catch(e) {}
                    }
                    
                    resolve(); // Risolve la Promise al primo caricamento riuscito
                }, (error) => {
                    console.error("Errore listener Firebase:", error);
                    // Fallback di emergenza
                    memoryData = JSON.parse(JSON.stringify(DEFAULT_DATA));
                    resolve();
                });
            } catch (error) {
                console.error("Errore initCloud:", error);
                memoryData = JSON.parse(JSON.stringify(DEFAULT_DATA));
                resolve();
            }
        });
    }

    function load() {
        if (!memoryData || !memoryData.cards) {
             console.warn("Storage.load() chiamato prima che i dati di Firebase fossero pronti. Uso fallback.");
             return JSON.parse(JSON.stringify(DEFAULT_DATA));
        }
        return memoryData; // Ritorna sempre i dati freschi tenuti in memoria dall'onSnapshot
    }

    function save(data) {
        try {
            memoryData = data;
            const user = firebase.auth().currentUser;

            // Scrive su Firestore solo se siamo loggati
            if (db && user) {
                db.collection('boards').doc(user.uid).set(data)
                  .catch(e => console.error("Errore scrittura Firebase Auth:", e));
            }
            return true;
        } catch (e) {
            console.error('Errore salvataggio dati:', e);
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
        save(data);
        return card;
    }

    function updateCard(cardId, updates) {
        const data = load();
        const idx = data.cards.findIndex(c => c.id === cardId);
        if (idx === -1) return null;
        Object.assign(data.cards[idx], updates, { updatedAt: new Date().toISOString() });
        save(data);
        return data.cards[idx];
    }

    function deleteCard(cardId) {
        const data = load();
        data.cards = data.cards.filter(c => c.id !== cardId);
        save(data);
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

        // Reorder cards in target column
        const targetCards = data.cards
            .filter(c => c.columnId === targetColumnId && !c.archived && c.id !== cardId)
            .sort((a, b) => a.order - b.order);

        targetCards.splice(targetOrder, 0, card);
        targetCards.forEach((c, i) => c.order = i);

        // Reorder old column if moved between columns
        if (oldColumnId !== targetColumnId) {
            const oldCards = data.cards
                .filter(c => c.columnId === oldColumnId && !c.archived)
                .sort((a, b) => a.order - b.order);
            oldCards.forEach((c, i) => c.order = i);
        }

        save(data);
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

        // Put restored card at the end of backlog
        const backlogCards = data.cards.filter(c => c.columnId === 'backlog' && !c.archived);
        card.archived = false;
        card.archivedAt = null;
        card.columnId = 'backlog';
        card.order = backlogCards.length;
        card.updatedAt = new Date().toISOString();
        save(data);
        return card;
    }

    function getArchivedCards() {
        const data = load();
        return data.cards
            .filter(c => c.archived)
            .sort((a, b) => new Date(b.archivedAt) - new Date(a.archivedAt));
    }

    // ----- Import/Export -----

    function exportJSON() {
        const data = load();
        data.settings.lastExport = new Date().toISOString();
        save(data);
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
                    save(imported);
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
        COLUMN_META, PRIORITIES, PIPELINES,
        createCard, updateCard, deleteCard, getCard,
        getCards, getAllActiveCards, moveCard,
        archiveCard, restoreCard, getArchivedCards,
        exportJSON, importJSON,
        searchCards, filterCards,
        getStats
    };
})();

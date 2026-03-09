// ============================================================
// BioTracker — archive.js
// Pannello archivio slide-in
// ============================================================

const Archive = (() => {
    let isOpen = false;

    function toggle() {
        isOpen = !isOpen;
        const panel = document.getElementById('archive-panel');
        if (isOpen) {
            refresh();
            panel.classList.add('open');
            document.body.classList.add('archive-open');
        } else {
            panel.classList.remove('open');
            document.body.classList.remove('archive-open');
        }
    }

    function close() {
        isOpen = false;
        const panel = document.getElementById('archive-panel');
        panel.classList.remove('open');
        document.body.classList.remove('archive-open');
    }

    function refresh() {
        const container = document.getElementById('archive-list');
        const searchInput = document.getElementById('archive-search');
        const query = searchInput ? searchInput.value.trim() : '';

        let cards = Storage.getArchivedCards();

        // Filter by search
        if (query) {
            const q = query.toLowerCase();
            cards = cards.filter(c =>
                c.title.toLowerCase().includes(q) ||
                c.description.toLowerCase().includes(q) ||
                c.pipeline.toLowerCase().includes(q) ||
                c.organism.toLowerCase().includes(q) ||
                c.dataset.toLowerCase().includes(q) ||
                c.notes.toLowerCase().includes(q) ||
                c.tags.some(t => t.toLowerCase().includes(q))
            );
        }

        const countEl = document.getElementById('archive-count');
        if (countEl) countEl.textContent = cards.length;

        if (!container) return;

        if (cards.length === 0) {
            container.innerHTML = `
                <div class="archive-empty">
                    <span class="archive-empty-icon">📦</span>
                    <p>${query ? 'Nessun risultato trovato' : 'Nessuna analisi archiviata'}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = cards.map(card => {
            const priority = Storage.PRIORITIES[card.priority] || Storage.PRIORITIES.medium;
            return `
                <div class="archive-card" onclick="Card.openModal('${card.id}')">
                    <div class="archive-card-header">
                        <span class="card-priority-badge" style="background: ${priority.color}20; color: ${priority.color}">
                            ${priority.emoji}
                        </span>
                        <span class="archive-card-title">${escapeHtml(card.title)}</span>
                    </div>
                    <div class="archive-card-meta">
                        ${card.pipeline ? `<span class="card-pipeline">${card.pipeline}</span>` : ''}
                        ${card.organism ? `<span class="card-organism">🧬 ${card.organism}</span>` : ''}
                    </div>
                    <div class="archive-card-footer">
                        <span class="archive-date">Archiviata: ${formatDate(card.archivedAt)}</span>
                        <button class="btn-restore-small" onclick="event.stopPropagation(); Archive.restoreCard('${card.id}')" title="Ripristina">
                            ♻️
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function restoreCard(cardId) {
        Storage.restoreCard(cardId);
        refresh();
        Board.refreshAllColumns();
        App.updateStats();
        App.showToast('Card ripristinata in Backlog', 'success');
    }

    return {
        toggle, close, refresh, restoreCard
    };
})();

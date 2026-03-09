// ============================================================
// BioTracker — card.js
// Card CRUD, rendering, modal dettaglio
// ============================================================

const Card = (() => {

    function createCardElement(card) {
        const priority = Storage.PRIORITIES[card.priority] || Storage.PRIORITIES.medium;

        const el = document.createElement('div');
        el.className = 'card';
        el.dataset.cardId = card.id;
        el.draggable = true;

        const tagsHtml = card.tags.length > 0
            ? `<div class="card-tags">${card.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>`
            : '';

        const pipelineHtml = card.pipeline
            ? `<span class="card-pipeline">${card.pipeline}</span>`
            : '';

        const organismHtml = card.organism
            ? `<span class="card-organism">🧬 ${card.organism}</span>`
            : '';

        el.innerHTML = `
            <div class="card-priority-bar" style="background: ${priority.color}"></div>
            <div class="card-content" onclick="Card.openModal('${card.id}')">
                <div class="card-header">
                    <span class="card-priority-badge" style="background: ${priority.color}20; color: ${priority.color}"
                          title="${priority.label}">${priority.emoji}</span>
                    <h3 class="card-title">${escapeHtml(card.title)}</h3>
                </div>
                ${card.description ? `<p class="card-description">${escapeHtml(card.description).substring(0, 100)}${card.description.length > 100 ? '...' : ''}</p>` : ''}
                <div class="card-meta">
                    ${pipelineHtml}
                    ${organismHtml}
                </div>
                ${tagsHtml}
                <div class="card-footer">
                    <span class="card-date" title="Creata: ${formatDate(card.createdAt)}">
                        ${formatRelativeDate(card.updatedAt)}
                    </span>
                    ${card.notes ? '<span class="card-has-notes" title="Ha note">📝</span>' : ''}
                </div>
            </div>
        `;

        return el;
    }

    // ----- Quick Add -----

    function showQuickAdd(columnId) {
        // Hide all other quick-adds
        document.querySelectorAll('.quick-add-form').forEach(f => f.style.display = 'none');

        const form = document.getElementById(`quick-add-${columnId}`);
        if (form) {
            form.style.display = 'block';
            const input = form.querySelector('.quick-add-input');
            input.value = '';
            input.focus();
        }
    }

    function hideQuickAdd(columnId) {
        const form = document.getElementById(`quick-add-${columnId}`);
        if (form) form.style.display = 'none';
    }

    function handleQuickAddKey(e, columnId) {
        if (e.key === 'Enter') {
            e.preventDefault();
            confirmQuickAdd(columnId);
        } else if (e.key === 'Escape') {
            hideQuickAdd(columnId);
        }
    }

    function confirmQuickAdd(columnId) {
        const form = document.getElementById(`quick-add-${columnId}`);
        if (!form) return;

        const title = form.querySelector('.quick-add-input').value.trim();
        const priority = form.querySelector('.quick-add-priority').value;

        if (!title) return;

        Storage.createCard({ title, priority, columnId });
        hideQuickAdd(columnId);
        Board.refreshColumn(columnId);
        App.updateStats();
    }

    // ----- Modal -----

    function openModal(cardId) {
        const card = Storage.getCard(cardId);
        if (!card) return;

        const modal = document.getElementById('card-modal');
        const priority = Storage.PRIORITIES[card.priority];

        modal.innerHTML = `
            <div class="modal-overlay" onclick="Card.closeModal()">
                <div class="modal-content" onclick="event.stopPropagation()">
                    <div class="modal-header" style="border-top: 3px solid ${priority.color}">
                        <h2 class="modal-title">
                            <span class="card-priority-badge" style="background: ${priority.color}20; color: ${priority.color}">
                                ${priority.emoji}
                            </span>
                            Dettaglio Analisi
                        </h2>
                        <button class="modal-close" onclick="Card.closeModal()">✕</button>
                    </div>
                    <div class="modal-body">
                        <form id="card-edit-form" onsubmit="Card.saveFromModal(event, '${card.id}')">
                            <div class="form-group">
                                <label>Titolo</label>
                                <input type="text" name="title" value="${escapeHtml(card.title)}" required>
                            </div>
                            <div class="form-group">
                                <label>Descrizione</label>
                                <textarea name="description" rows="3">${escapeHtml(card.description)}</textarea>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Priorità</label>
                                    <select name="priority">
                                        ${Object.entries(Storage.PRIORITIES).map(([k, v]) =>
                                            `<option value="${k}" ${k === card.priority ? 'selected' : ''}>${v.emoji} ${v.label}</option>`
                                        ).join('')}
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Colonna</label>
                                    <select name="columnId">
                                        ${Object.entries(Storage.COLUMN_META).map(([k, v]) =>
                                            `<option value="${k}" ${k === card.columnId ? 'selected' : ''}>${v.name}</option>`
                                        ).join('')}
                                    </select>
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Pipeline</label>
                                    <select name="pipeline">
                                        <option value="">-- Seleziona --</option>
                                        ${Storage.PIPELINES.map(p =>
                                            `<option value="${p}" ${p === card.pipeline ? 'selected' : ''}>${p}</option>`
                                        ).join('')}
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Organismo</label>
                                    <input type="text" name="organism" value="${escapeHtml(card.organism)}" placeholder="es. Homo sapiens">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Dataset</label>
                                <input type="text" name="dataset" value="${escapeHtml(card.dataset)}" placeholder="es. SRA, GEO accession...">
                            </div>
                            <div class="form-group">
                                <label>Tag (separati da virgola)</label>
                                <input type="text" name="tags" value="${card.tags.join(', ')}" placeholder="es. urgente, pubblicazione, revisione">
                            </div>
                            <div class="form-group">
                                <label>Note</label>
                                <textarea name="notes" rows="4" placeholder="Note aggiuntive, comandi usati, risultati parziali...">${escapeHtml(card.notes)}</textarea>
                            </div>
                            <div class="modal-info">
                                <span>Creata: ${formatDate(card.createdAt)}</span>
                                <span>Modificata: ${formatDate(card.updatedAt)}</span>
                                ${card.archived ? `<span>Archiviata: ${formatDate(card.archivedAt)}</span>` : ''}
                            </div>
                            <div class="modal-actions">
                                <button type="submit" class="btn btn-primary">💾 Salva</button>
                                ${!card.archived ? `<button type="button" class="btn btn-archive" onclick="Card.archiveFromModal('${card.id}')">📦 Archivia</button>` : ''}
                                ${card.archived ? `<button type="button" class="btn btn-restore" onclick="Card.restoreFromModal('${card.id}')">♻️ Ripristina</button>` : ''}
                                <button type="button" class="btn btn-danger" id="btn-delete" onclick="Card.deleteFromModal('${card.id}', this)">🗑️ Elimina</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;

        modal.style.display = 'block';
        document.body.classList.add('modal-open');

        // Focus title
        setTimeout(() => {
            const titleInput = modal.querySelector('input[name="title"]');
            if (titleInput) titleInput.focus();
        }, 100);
    }

    function closeModal() {
        const modal = document.getElementById('card-modal');
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
    }

    function saveFromModal(e, cardId) {
        e.preventDefault();
        const form = document.getElementById('card-edit-form');
        const formData = new FormData(form);

        const updates = {
            title: formData.get('title'),
            description: formData.get('description'),
            priority: formData.get('priority'),
            columnId: formData.get('columnId'),
            pipeline: formData.get('pipeline'),
            organism: formData.get('organism'),
            dataset: formData.get('dataset'),
            tags: formData.get('tags').split(',').map(t => t.trim()).filter(Boolean),
            notes: formData.get('notes')
        };

        Storage.updateCard(cardId, updates);
        closeModal();
        Board.refreshAllColumns();
        App.updateStats();
    }

    function archiveFromModal(cardId) {
        Storage.archiveCard(cardId);
        closeModal();
        Board.refreshAllColumns();
        App.updateStats();
        App.showToast('Card archiviata', 'success');
    }

    function restoreFromModal(cardId) {
        Storage.restoreCard(cardId);
        closeModal();
        Board.refreshAllColumns();
        Archive.refresh();
        App.updateStats();
        App.showToast('Card ripristinata in Backlog', 'success');
    }

    let deleteConfirmTimeout;
    function deleteFromModal(cardId, btnElement) {
        if (!btnElement.classList.contains('confirming-delete')) {
            btnElement.classList.add('confirming-delete');
            btnElement.innerHTML = '⚠️ Conferma Eliminazione';
            btnElement.style.backgroundColor = 'var(--accent-red)';
            btnElement.style.color = 'white';
            
            clearTimeout(deleteConfirmTimeout);
            deleteConfirmTimeout = setTimeout(() => {
                if (btnElement && btnElement.parentNode) {
                    btnElement.classList.remove('confirming-delete');
                    btnElement.innerHTML = '🗑️ Elimina';
                    btnElement.style.backgroundColor = '';
                    btnElement.style.color = 'var(--accent-red)';
                }
            }, 3000);
            return;
        }

        Storage.deleteCard(cardId);
        closeModal();
        Board.refreshAllColumns();
        Archive.refresh();
        App.updateStats();
        App.showToast('Card eliminata', 'warning');
    }

    // ----- Utilities -----

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatDate(isoStr) {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        return d.toLocaleDateString('it-IT', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    function formatRelativeDate(isoStr) {
        if (!isoStr) return '';
        const now = new Date();
        const d = new Date(isoStr);
        const diff = Math.floor((now - d) / 1000);

        if (diff < 60) return 'ora';
        if (diff < 3600) return Math.floor(diff / 60) + ' min fa';
        if (diff < 86400) return Math.floor(diff / 3600) + ' ore fa';
        if (diff < 604800) return Math.floor(diff / 86400) + ' gg fa';
        return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
    }

    // Expose escapeHtml and formatDate globally for other modules
    window.escapeHtml = escapeHtml;
    window.formatDate = formatDate;

    return {
        createCardElement,
        showQuickAdd, hideQuickAdd, handleQuickAddKey, confirmQuickAdd,
        openModal, closeModal, saveFromModal,
        archiveFromModal, restoreFromModal, deleteFromModal
    };
})();

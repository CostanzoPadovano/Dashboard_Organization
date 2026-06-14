// ============================================================
// BioTracker — card.js
// Card CRUD, rendering, modal dettaglio
// ============================================================

const Card = (() => {

    const MAX_MICROTASK_SLOTS = 20;

    function getTodayKey() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function generateMicrotaskId() {
        return 'microtask_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    }

    function getTodayMicrotasks(card) {
        const today = getTodayKey();
        return (Array.isArray(card.microtasks) ? card.microtasks : [])
            .filter(task => task.date === today)
            .sort((a, b) => a.order - b.order);
    }

    function getMicrotaskProgress(card) {
        const tasks = getTodayMicrotasks(card).filter(task => task.title || task.completed);
        const completed = tasks.filter(task => task.completed).length;
        return { total: tasks.length, completed };
    }

    function formatTodayLabel() {
        return new Date().toLocaleDateString('it-IT', {
            weekday: 'short',
            day: '2-digit',
            month: '2-digit'
        });
    }

    function createCardElement(card) {
        const priority = Storage.PRIORITIES[card.priority] || Storage.PRIORITIES.medium;
        const microtaskProgress = getMicrotaskProgress(card);
        const microtaskBadgeHtml = microtaskProgress.total > 0
            ? `<span class="card-microtasks ${microtaskProgress.completed === microtaskProgress.total ? 'complete' : ''}"
                     title="Microtask oggi: ${microtaskProgress.completed}/${microtaskProgress.total}">
                   ✓ ${microtaskProgress.completed}/${microtaskProgress.total}
               </span>`
            : '';

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
                    <div class="card-footer-left">
                        <span class="card-date" title="Creata: ${formatDate(card.createdAt)}">
                            ${formatRelativeDate(card.updatedAt)}
                        </span>
                        ${microtaskBadgeHtml}
                    </div>
                    <div class="card-footer-icons">
                        ${card.notes ? '<span class="card-has-notes" title="Ha note">📝</span>' : ''}
                    </div>
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

    // ----- Microtasks -----

    function renderMicrotaskCard(task = {}, index = 0) {
        const completed = !!task.completed;
        const id = task.id || '';
        const createdAt = task.createdAt || '';
        const updatedAt = task.updatedAt || '';
        return `
            <div class="microtask-card ${completed ? 'completed' : ''}"
                 data-microtask-id="${escapeHtml(id)}"
                 data-created-at="${escapeHtml(createdAt)}"
                 data-updated-at="${escapeHtml(updatedAt)}">
                <div class="microtask-card-top">
                    <span class="microtask-index">${index + 1}</span>
                    <select class="microtask-status" onchange="Card.updateMicrotaskStatus(this)" aria-label="Stato microtask">
                        <option value="todo" ${!completed ? 'selected' : ''}>Da fare</option>
                        <option value="completed" ${completed ? 'selected' : ''}>Completato</option>
                    </select>
                </div>
                <input type="text"
                       class="microtask-title"
                       value="${escapeHtml(task.title || '')}"
                       placeholder="Microtask ${index + 1}"
                       oninput="Card.updateMicrotaskProgress()">
            </div>
        `;
    }

    function renderMicrotasksSection(card) {
        const tasks = getTodayMicrotasks(card);
        const progress = getMicrotaskProgress(card);
        const percent = progress.total ? Math.round((progress.completed / progress.total) * 100) : 0;

        return `
            <section class="microtasks-section" data-date="${getTodayKey()}">
                <div class="microtasks-header">
                    <div>
                        <label>Microtask giornalieri</label>
                        <p class="microtasks-subtitle">Oggi · ${formatTodayLabel()}</p>
                    </div>
                    <div class="microtasks-controls">
                        <div class="microtasks-count-control">
                            <span>Numero</span>
                            <input type="number"
                                   id="microtask-count"
                                   min="0"
                                   max="${MAX_MICROTASK_SLOTS}"
                                   value="${tasks.length}"
                                   oninput="Card.syncMicrotaskSlots()">
                        </div>
                        <button type="button" class="btn-microtask-add" onclick="Card.addMicrotaskSlot()">+ Aggiungi</button>
                    </div>
                </div>
                <div class="microtasks-progress-row">
                    <span id="microtasks-progress-label">${progress.completed}/${progress.total} completati oggi</span>
                    <div class="microtasks-progress-track">
                        <div id="microtasks-progress-fill" class="microtasks-progress-fill" style="width: ${percent}%"></div>
                    </div>
                </div>
                <div id="microtasks-grid" class="microtasks-grid">
                    ${tasks.map((task, index) => renderMicrotaskCard(task, index)).join('')}
                </div>
                <p id="microtasks-empty" class="microtasks-empty" style="${tasks.length ? 'display:none' : ''}">
                    Nessun microtask per oggi. Imposta un numero o usa "+ Aggiungi".
                </p>
            </section>
        `;
    }

    function renumberMicrotaskCards() {
        document.querySelectorAll('#microtasks-grid .microtask-card').forEach((cardEl, index) => {
            const indexEl = cardEl.querySelector('.microtask-index');
            const titleInput = cardEl.querySelector('.microtask-title');
            if (indexEl) indexEl.textContent = index + 1;
            if (titleInput && !titleInput.value.trim()) titleInput.placeholder = `Microtask ${index + 1}`;
        });
    }

    function syncMicrotaskSlots() {
        const countInput = document.getElementById('microtask-count');
        const grid = document.getElementById('microtasks-grid');
        if (!countInput || !grid) return;

        let targetCount = parseInt(countInput.value, 10);
        if (Number.isNaN(targetCount)) targetCount = 0;
        targetCount = Math.max(0, Math.min(MAX_MICROTASK_SLOTS, targetCount));
        countInput.value = targetCount;

        let cards = Array.from(grid.querySelectorAll('.microtask-card'));
        while (cards.length < targetCount) {
            grid.insertAdjacentHTML('beforeend', renderMicrotaskCard({}, cards.length));
            cards = Array.from(grid.querySelectorAll('.microtask-card'));
        }

        while (cards.length > targetCount) {
            const last = cards.pop();
            if (last) last.remove();
        }

        renumberMicrotaskCards();
        updateMicrotaskProgress();
    }

    function addMicrotaskSlot() {
        const countInput = document.getElementById('microtask-count');
        if (!countInput) return;

        const current = parseInt(countInput.value, 10) || 0;
        countInput.value = Math.min(MAX_MICROTASK_SLOTS, current + 1);
        syncMicrotaskSlots();

        const titles = document.querySelectorAll('#microtasks-grid .microtask-title');
        const lastTitle = titles[titles.length - 1];
        if (lastTitle) lastTitle.focus();
    }

    function updateMicrotaskStatus(selectEl) {
        const cardEl = selectEl.closest('.microtask-card');
        if (cardEl) cardEl.classList.toggle('completed', selectEl.value === 'completed');
        updateMicrotaskProgress();
    }

    function updateMicrotaskProgress() {
        const cards = Array.from(document.querySelectorAll('#microtasks-grid .microtask-card'));
        const completed = cards.filter(cardEl => {
            const status = cardEl.querySelector('.microtask-status');
            return status && status.value === 'completed';
        }).length;
        const total = cards.length;
        const percent = total ? Math.round((completed / total) * 100) : 0;

        const label = document.getElementById('microtasks-progress-label');
        const fill = document.getElementById('microtasks-progress-fill');
        const empty = document.getElementById('microtasks-empty');

        if (label) label.textContent = `${completed}/${total} completati oggi`;
        if (fill) fill.style.width = `${percent}%`;
        if (empty) empty.style.display = total ? 'none' : '';
    }

    function collectMicrotasksFromModal(today, existingTodayTasks = []) {
        const now = new Date().toISOString();
        return Array.from(document.querySelectorAll('#microtasks-grid .microtask-card'))
            .map((cardEl, index) => {
                const titleInput = cardEl.querySelector('.microtask-title');
                const statusSelect = cardEl.querySelector('.microtask-status');
                const title = titleInput ? titleInput.value.trim() : '';
                const existing = existingTodayTasks[index] || {};
                const completed = statusSelect ? statusSelect.value === 'completed' : false;

                return {
                    id: cardEl.dataset.microtaskId || existing.id || generateMicrotaskId(),
                    title,
                    completed,
                    date: today,
                    order: index,
                    createdAt: cardEl.dataset.createdAt || existing.createdAt || now,
                    updatedAt: now
                };
            })
            .filter(task => task.title || task.completed);
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
                            ${renderMicrotasksSection(card)}
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
        const card = Storage.getCard(cardId);
        const today = getTodayKey();
        const existingMicrotasks = Array.isArray(card?.microtasks) ? card.microtasks : [];
        const existingTodayTasks = existingMicrotasks
            .filter(task => task.date === today)
            .sort((a, b) => a.order - b.order);
        const preservedMicrotasks = existingMicrotasks.filter(task => task.date !== today);

        const updates = {
            title: formData.get('title'),
            description: formData.get('description'),
            priority: formData.get('priority'),
            columnId: formData.get('columnId'),
            pipeline: formData.get('pipeline'),
            organism: formData.get('organism'),
            dataset: formData.get('dataset'),
            tags: formData.get('tags').split(',').map(t => t.trim()).filter(Boolean),
            notes: formData.get('notes'),
            microtasks: [
                ...preservedMicrotasks,
                ...collectMicrotasksFromModal(today, existingTodayTasks)
            ]
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
        syncMicrotaskSlots, addMicrotaskSlot, updateMicrotaskStatus, updateMicrotaskProgress,
        openModal, closeModal, saveFromModal,
        archiveFromModal, restoreFromModal, deleteFromModal
    };
})();

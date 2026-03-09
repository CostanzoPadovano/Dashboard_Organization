// ============================================================
// BioTracker — board.js
// Kanban board rendering e drag-and-drop
// ============================================================

const Board = (() => {
    let draggedCard = null;
    let draggedElement = null;
    let placeholder = null;

    function init() {
        renderBoard();
        setupDragAndDrop();
    }

    function renderBoard() {
        const boardEl = document.getElementById('board');
        if (!boardEl) return;
        boardEl.innerHTML = '';

        const columns = Storage.load().projects[0].columns;
        columns.forEach(colId => {
            const colEl = createColumnElement(colId);
            boardEl.appendChild(colEl);
        });
    }

    function createColumnElement(columnId) {
        const meta = Storage.COLUMN_META[columnId];
        const cards = Storage.getCards(columnId);

        const col = document.createElement('div');
        col.className = 'column';
        col.dataset.columnId = columnId;

        col.innerHTML = `
            <div class="column-header" style="--col-color: ${meta.color}">
                <div class="column-title-row">
                    <span class="column-title">${meta.name}</span>
                    <span class="column-count">${cards.length}</span>
                </div>
                <button class="btn-add-card" onclick="Card.showQuickAdd('${columnId}')" title="Nuova card">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z"/>
                    </svg>
                </button>
            </div>
            <div class="column-cards" data-column-id="${columnId}">
                <div class="quick-add-form" id="quick-add-${columnId}" style="display:none">
                    <input type="text" class="quick-add-input" placeholder="Titolo analisi..."
                           onkeydown="Card.handleQuickAddKey(event, '${columnId}')">
                    <div class="quick-add-actions">
                        <select class="quick-add-priority">
                            ${Object.entries(Storage.PRIORITIES).map(([k, v]) =>
                                `<option value="${k}" ${k === 'medium' ? 'selected' : ''}>${v.emoji} ${v.label}</option>`
                            ).join('')}
                        </select>
                        <button class="btn-confirm" onclick="Card.confirmQuickAdd('${columnId}')">Aggiungi</button>
                        <button class="btn-cancel" onclick="Card.hideQuickAdd('${columnId}')">✕</button>
                    </div>
                </div>
            </div>
        `;

        const cardsContainer = col.querySelector('.column-cards');
        cards.forEach(card => {
            cardsContainer.appendChild(Card.createCardElement(card));
        });

        return col;
    }

    function refreshColumn(columnId) {
        const container = document.querySelector(`.column-cards[data-column-id="${columnId}"]`);
        if (!container) return;

        // Save quick-add state
        const quickAdd = container.querySelector('.quick-add-form');
        const quickAddVisible = quickAdd && quickAdd.style.display !== 'none';

        // Remove only card elements and placeholders, keep the quick-add form
        const cardElements = container.querySelectorAll('.card, .card-placeholder');
        cardElements.forEach(el => el.remove());

        // Re-add cards
        const cards = Storage.getCards(columnId);
        cards.forEach(card => {
            container.appendChild(Card.createCardElement(card));
        });

        // Update count
        const col = container.closest('.column');
        const countEl = col.querySelector('.column-count');
        if (countEl) countEl.textContent = cards.length;
    }

    function refreshAllColumns() {
        const columns = Storage.load().projects[0].columns;
        columns.forEach(colId => refreshColumn(colId));
    }

    // ----- Drag and Drop -----

    function setupDragAndDrop() {
        const board = document.getElementById('board');
        if (!board) return;

        board.addEventListener('dragstart', handleDragStart);
        board.addEventListener('dragend', handleDragEnd);
        board.addEventListener('dragover', handleDragOver);
        board.addEventListener('drop', handleDrop);
    }

    function handleDragStart(e) {
        const card = e.target.closest('.card');
        if (!card) return;

        draggedCard = card.dataset.cardId;
        draggedElement = card;

        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedCard);

        // Create placeholder
        placeholder = document.createElement('div');
        placeholder.className = 'card-placeholder';
        placeholder.style.height = card.offsetHeight + 'px';

        requestAnimationFrame(() => {
            card.style.opacity = '0.4';
        });
    }

    function handleDragEnd(e) {
        if (draggedElement) {
            draggedElement.classList.remove('dragging');
            draggedElement.style.opacity = '';
        }
        if (placeholder && placeholder.parentNode) {
            placeholder.parentNode.removeChild(placeholder);
        }

        // Remove all drag-over states
        document.querySelectorAll('.column-cards.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });

        // Clean up any other zombie placeholders
        document.querySelectorAll('.card-placeholder').forEach(el => el.remove());

        draggedCard = null;
        draggedElement = null;
        placeholder = null;
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const container = e.target.closest('.column-cards');
        if (!container) return;

        // Highlight target column
        document.querySelectorAll('.column-cards.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
        container.classList.add('drag-over');

        // Position placeholder
        const afterElement = getDragAfterElement(container, e.clientY);
        if (placeholder) {
            if (afterElement) {
                container.insertBefore(placeholder, afterElement);
            } else {
                container.appendChild(placeholder);
            }
        }
    }

    function handleDrop(e) {
        e.preventDefault();
        const container = e.target.closest('.column-cards');
        if (!container || !draggedCard) return;

        const targetColumnId = container.dataset.columnId;
        const afterElement = getDragAfterElement(container, e.clientY);

        // Calculate target order
        let targetOrder = 0;
        if (afterElement) {
            const cards = Array.from(container.querySelectorAll('.card:not(.dragging)'));
            targetOrder = cards.indexOf(afterElement);
        } else {
            targetOrder = container.querySelectorAll('.card:not(.dragging)').length;
        }

        Storage.moveCard(draggedCard, targetColumnId, targetOrder);
        refreshAllColumns();
        App.updateStats();
    }

    function getDragAfterElement(container, y) {
        const cards = Array.from(
            container.querySelectorAll('.card:not(.dragging):not(.card-placeholder)')
        );

        return cards.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset, element: child };
            }
            return closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    return {
        init,
        renderBoard,
        refreshColumn,
        refreshAllColumns
    };
})();

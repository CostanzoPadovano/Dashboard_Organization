// ============================================================
// BioTracker — search.js
// Ricerca globale e filtri
// ============================================================

const Search = (() => {
    let activeFilters = {
        query: '',
        priority: '',
        pipeline: ''
    };

    function init() {
        const searchInput = document.getElementById('global-search');
        if (searchInput) {
            searchInput.addEventListener('input', debounce(handleSearch, 200));
        }

        const priorityFilter = document.getElementById('filter-priority');
        if (priorityFilter) {
            priorityFilter.addEventListener('change', handleFilterChange);
        }

        const pipelineFilter = document.getElementById('filter-pipeline');
        if (pipelineFilter) {
            pipelineFilter.addEventListener('change', handleFilterChange);
        }
    }

    function handleSearch(e) {
        activeFilters.query = e.target.value.trim().toLowerCase();
        applyFilters();
    }

    function handleFilterChange() {
        const priorityFilter = document.getElementById('filter-priority');
        const pipelineFilter = document.getElementById('filter-pipeline');

        activeFilters.priority = priorityFilter ? priorityFilter.value : '';
        activeFilters.pipeline = pipelineFilter ? pipelineFilter.value : '';

        applyFilters();
    }

    function applyFilters() {
        const hasFilters = activeFilters.query || activeFilters.priority || activeFilters.pipeline;
        const cards = document.querySelectorAll('.card');

        cards.forEach(cardEl => {
            const cardId = cardEl.dataset.cardId;
            const card = Storage.getCard(cardId);
            if (!card) return;

            let visible = true;

            if (activeFilters.query) {
                const q = activeFilters.query;
                visible = (
                    card.title.toLowerCase().includes(q) ||
                    card.description.toLowerCase().includes(q) ||
                    card.pipeline.toLowerCase().includes(q) ||
                    card.organism.toLowerCase().includes(q) ||
                    card.dataset.toLowerCase().includes(q) ||
                    card.notes.toLowerCase().includes(q) ||
                    card.tags.some(t => t.toLowerCase().includes(q))
                );
            }

            if (visible && activeFilters.priority) {
                visible = card.priority === activeFilters.priority;
            }

            if (visible && activeFilters.pipeline) {
                visible = card.pipeline === activeFilters.pipeline;
            }

            cardEl.style.display = visible ? '' : 'none';
            cardEl.classList.toggle('search-hidden', !visible);
        });

        // Update filter indicator
        const indicator = document.getElementById('filter-indicator');
        if (indicator) {
            indicator.style.display = hasFilters ? 'flex' : 'none';
        }
    }

    function clearFilters() {
        activeFilters = { query: '', priority: '', pipeline: '' };

        const searchInput = document.getElementById('global-search');
        if (searchInput) searchInput.value = '';

        const priorityFilter = document.getElementById('filter-priority');
        if (priorityFilter) priorityFilter.value = '';

        const pipelineFilter = document.getElementById('filter-pipeline');
        if (pipelineFilter) pipelineFilter.value = '';

        applyFilters();
    }

    function debounce(fn, delay) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    return {
        init, clearFilters, applyFilters
    };
})();

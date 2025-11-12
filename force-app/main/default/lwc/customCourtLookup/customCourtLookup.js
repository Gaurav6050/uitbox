import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import searchCourts from '@salesforce/apex/AiTicketModalEnhancedController.searchCourts';

const DEBOUNCE_DELAY = 300;

// *** FIX: Removed unused NavigationMixin ***
export default class CustomCourtLookup extends LightningElement {
    @api label = 'Court';
    @api placeholder = 'Search for a court...';
    @api required = false;

    _initialSelection;
    @api 
    get initialSelection() {
        return this._initialSelection;
    }
    set initialSelection(value) {
        this._initialSelection = value;
        this.selectedRecord = value;
    }

    @track searchTerm = '';
    @track searchResults = [];
    @track selectedRecord = null;
    @track error;
    @track hasFocus = false;
    @track offset = 0;
    @track isLoadingMore = false;
    canLoadMore = true;
    debounceTimeout;

    connectedCallback() {
        if (this._initialSelection) {
            this.selectedRecord = this._initialSelection;
        }
    }

    // --- Getters for Dynamic UI ---
    get hasResults() { return this.searchResults.length > 0; }
    get showNewOption() { return this.hasFocus; }
    get newOptionText() { return this.searchTerm ? `New Court: "${this.searchTerm}"` : 'New Court'; }
    get hasResultsOrNewOption() { return this.hasResults || this.showNewOption; }
    get comboboxClasses() {
        let classes = 'slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click';
        if (this.hasFocus && this.hasResultsOrNewOption) {
            classes += ' slds-is-open';
        }
        return classes;
    }

    // --- Public Methods ---
    @api clearSelection() { this.handleClearSelection(); }
    
    // --- Event Handlers ---
    handleFocus() {
        this.hasFocus = true;
        if (this.searchResults.length === 0 && this.searchTerm === '') {
            this.fetchRecords(false);
        }
    }

    handleBlur() { setTimeout(() => { this.hasFocus = false; }, 200); }

    handleSearchChange(event) {
        this.searchTerm = event.target.value;
        this.offset = 0;
        this.canLoadMore = true;
        clearTimeout(this.debounceTimeout);
        this.debounceTimeout = setTimeout(() => { this.fetchRecords(true); }, DEBOUNCE_DELAY);
    }

    handleRecordSelect(event) {
        const { id } = event.currentTarget.dataset;
        const selected = this.searchResults.find(record => record.Id === id);
        this.selectedRecord = selected;
        this.searchTerm = '';
        this.searchResults = [];
        this.dispatchEvent(new CustomEvent('selectionchange', { detail: { selectedRecord: selected } }));
    }

    handleClearSelection() {
        this.selectedRecord = null;
        this.searchTerm = '';
        this.searchResults = [];
        this.dispatchEvent(new CustomEvent('selectionchange', { detail: { selectedRecord: null } }));
    }

    handleScroll(event) {
        const { scrollTop, scrollHeight, clientHeight } = event.target;
        if (scrollTop + clientHeight >= scrollHeight - 5 && !this.isLoadingMore && this.canLoadMore) {
            this.offset += 10;
            this.fetchRecords(false);
        }
    }

    handleNewCourtClick() {
        this.dispatchEvent(new CustomEvent('requestnewcourt', {
            detail: {
                initialSearchTerm: this.searchTerm
            }
        }));
        this.hasFocus = false;
    }

    // --- Helper Methods ---
    fetchRecords(isNewSearch) {
        this.error = undefined;
        this.isLoadingMore = true;
        searchCourts({ searchTerm: this.searchTerm, offset: this.offset })
            .then(result => {
                this.searchResults = isNewSearch ? result.courts : [...this.searchResults, ...result.courts];
                this.canLoadMore = result.courts.length === 10;
            })
            .catch(error => {
                this.error = 'Error searching courts: ' + error.body.message;
                this.searchResults = [];
            })
            .finally(() => { this.isLoadingMore = false; });
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
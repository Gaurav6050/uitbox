import { LightningElement, api, wire, track } from "lwc";
import { ShowToastEvent } from "lightning/platformShowToastEvent";

// Schema Imports
import DRIVER_FIELD from "@salesforce/schema/Inspection__c.Driver__c";
import CARRIER_FIELD from "@salesforce/schema/Inspection__c.Carrier__c";
import CHALLENGETYPE_FIELD from "@salesforce/schema/Inspection__c.Challenge_Type__c";
import INSPECTIONSTATUS_FIELD from "@salesforce/schema/Inspection__c.Status__c";
import ASSOCIATED_TICKET_FIELD from "@salesforce/schema/Inspection__c.Associated_Ticket__c";
import INSP_REPORT_NUMBER_FIELD from "@salesforce/schema/Inspection__c.Insp_Report_Num__c";

// Apex Imports
import updateCase from "@salesforce/apex/CreateComplianceController.updateCase";
import getAllFilesForCase from "@salesforce/apex/CreateComplianceController.getAllFilesForCase";

// Constants
const DEFAULT_SCALE = 1.0;
const HOVER_ZOOM_SCALE = 1.8;
const LOCKED_ZOOM_STEP = 0.3;
const MIN_LOCKED_EFFECTIVE_SCALE = DEFAULT_SCALE;
const FULL_SCREEN_ZOOM_STEP = 0.25;
const MIN_FULL_SCREEN_SCALE = 1.0;

export default class CreateCompliance extends LightningElement {
    @api caseId;
    @api ticketId;
    isLoading = false;
    _driverId;
    _carrierId;
    inspReportValue = "";
    challengeTypeValue = "DataQ - SMS Violation";
    inspectionStatusValue;

    @api
    set driverId(value) { this._driverId = value; }
    get driverId() { return this._driverId; }

    @api
    set carrierId(value) { this._carrierId = value; }
    get carrierId() { return this._carrierId; }

    // --- File Viewer State ---
    @track files = [];
    @track fileOptions = [];
    @track currentFileIndex = 0;
    _lastRenderedFileIndex = -1;
    isCurrentFileLoading = false;
    viewerErrorMessage = '';

    isHoverZoomActive = false;
    isZoomLocked = false;
    currentLockedAdjustedScale = DEFAULT_SCALE;
    hoverTransformOriginX = '50%';
    hoverTransformOriginY = '50%';
    lockedTransformOriginX = '50%';
    lockedTransformOriginY = '50%';
    currentRotationAngle = 0;
    isPanning = false;
    panStartX; panStartY;
    scrollWrapperScrollLeftStart;
    scrollWrapperScrollTopStart;

    isFullScreenPreview = false;
    fullScreenScale = MIN_FULL_SCREEN_SCALE;

    _boundHandleKeyDown;
    _boundHandleMouseUpGlobalPanning;

    // --- Schema ---
    objectApiName = "Inspection__c";
    driverField = DRIVER_FIELD;
    carrierField = CARRIER_FIELD;
    challengeTypeField = CHALLENGETYPE_FIELD;
    inspectionStatusField = INSPECTIONSTATUS_FIELD;
    associatedTicketFiled = ASSOCIATED_TICKET_FIELD;
    inspReportNumberField = INSP_REPORT_NUMBER_FIELD;

    // --- Wire Service for Files ---
    @wire(getAllFilesForCase, { caseId: '$caseId' })
    wiredFilesHandler({ error, data }) {
        if (data) {
            this.files = data.map(file => {
                const isPdf = file.Name && file.Name.toLowerCase().endsWith('.pdf');
                return {
                    id: file.Id,
                    url: file.NEILON__File_Presigned_URL__c,
                    name: file.Name || 'Untitled Document',
                    type: isPdf ? 'pdf' : 'image'
                };
            });
            
            this.fileOptions = data.map((file, index) => ({
                label: file.Name || `File ${index + 1}`,
                value: index.toString()
            }));

            this.viewerErrorMessage = this.files.length === 0 ? 'No files found for this case.' : '';
        } else if (error) {
            this.viewerErrorMessage = 'Error loading files.';
            console.error('Error fetching files:', error);
        }
    }
    
    // --- Lifecycle Hooks ---
    connectedCallback() {
        this._boundHandleKeyDown = this.handleKeyDown.bind(this);
        this._boundHandleMouseUpGlobalPanning = this.handleViewerMouseUpPanning.bind(this);
        document.addEventListener('keydown', this._boundHandleKeyDown);
        document.addEventListener('mouseup', this._boundHandleMouseUpGlobalPanning);
    }

    disconnectedCallback() {
        document.removeEventListener('keydown', this._boundHandleKeyDown);
        document.removeEventListener('mouseup', this._boundHandleMouseUpGlobalPanning);
    }
    
    renderedCallback() {
        if (this.isCurrentImageAnImage && this.currentFileIndex !== this._lastRenderedFileIndex) {
            const imgElement = this.template.querySelector('img.zoomable-image');
            if (imgElement) {
                this.isCurrentFileLoading = true;
                imgElement.onload = () => this.handleImageLoadSuccess();
                imgElement.onerror = () => this.handleImageLoadError();
            }
        } else if (this.isCurrentImageAPdf && this.currentFileIndex !== this._lastRenderedFileIndex) {
            this.isCurrentFileLoading = false;
            this._lastRenderedFileIndex = this.currentFileIndex;
            this.resetImageSpecificState();
        }
    }

    handleImageLoadSuccess() {
        this.isCurrentFileLoading = false;
        this._lastRenderedFileIndex = this.currentFileIndex;
        this.initializeCurrentImageDisplay();
    }

    handleImageLoadError() {
        this.isCurrentFileLoading = false;
        this._lastRenderedFileIndex = this.currentFileIndex;
        this.viewerErrorMessage = `Could not load image: ${this.currentFile.name}`;
    }

    // --- Compliance Form Handlers ---
    handleFieldChange(event) {
        const fieldName = event.target.dataset.id;
        const value = event.detail.value !== undefined ? event.detail.value : event.target.value;

        if (fieldName === "driver") {
            this._driverId = Array.isArray(value) && value.length > 0 ? value[0] : null;
        } else if (fieldName === "carrier") {
            this._carrierId = Array.isArray(value) && value.length > 0 ? value[0] : null;
        } else if (fieldName === "inspReport") {
            this.inspReportValue = value;
        } else if (fieldName === "challengeType") {
            this.challengeTypeValue = value;
        } else if (fieldName === "inspectionStatus") {
            this.inspectionStatusValue = value;
        }
    }

    handleSaveClick() {
        this.isLoading = true;
        const inspReportInput = this.template.querySelector('[data-id="inspReport"]');
        if (!this.inspReportValue || !this.inspReportValue.trim()) {
            inspReportInput.reportValidity();
            this.isLoading = false;
            return;
        }

        try {
            const fieldsToSubmit = {
                [this.driverField.fieldApiName]: this._driverId,
                [this.carrierField.fieldApiName]: this._carrierId,
                [this.associatedTicketFiled.fieldApiName]: this.ticketId,
                [this.challengeTypeField.fieldApiName]: this.challengeTypeValue,
                [this.inspectionStatusField.fieldApiName]: this.inspectionStatusValue,
                [this.inspReportNumberField.fieldApiName]: this.inspReportValue.trim(),
            };
            this.template.querySelector('lightning-record-edit-form[data-id="compliance-form"]').submit(fieldsToSubmit);
        } catch (error) {
            this.isLoading = false;
            console.error("Error preparing data for save:", error);
            this.showToast("Client-Side Error", "Error reading form values.", "error");
        }
    }

    handleCancel() { this.dispatchEvent(new CustomEvent("cancel")); }

    handleSuccess(event) {
        const id = event.detail.id;
        updateCase({ inspectionId: id, caseId: this.caseId })
            .catch((error) => {
                console.error("Error updating case record: ", error);
                this.showToast("Warning", "Challenge created, but failed to link to case.", "warning");
            });
        this.showToast("Success", "New Compliance Challenge was created.", "success");
        this.dispatchEvent(new CustomEvent("success", { detail: { id: id } }));
        this.isLoading = false;
    }

    handleError(event) {
        this.isLoading = false;
        this.showToast("Error Creating Record", event.detail.message, "error");
        console.error("Error creating compliance record: ", JSON.stringify(event.detail));
    }

    // --- File Viewer Getters ---
    get hasFiles() { return this.files && this.files.length > 0; }
    get currentFile() { return this.hasFiles ? this.files[this.currentFileIndex] : {}; }
    get currentFileUrl() { return this.currentFile.url; }
    get currentFileName() { return this.currentFile.name || 'N/A'; }
    get currentImageNumber() { return this.hasFiles ? this.currentFileIndex + 1 : 0; }
    get totalImages() { return this.files.length; }
    get hasMultipleImages() { return this.totalImages > 1; }
    get isPreviousDisabled() { return this.currentFileIndex === 0; }
    get isNextDisabled() { return this.currentFileIndex >= this.totalImages - 1; }
    get isCurrentImageAnImage() { return this.currentFile.type === 'image'; }
    get isCurrentImageAPdf() { return this.currentFile.type === 'pdf'; }
    get isCurrentImageAnImage_and_isZoomLocked() { return this.isCurrentImageAnImage && this.isZoomLocked; }
    get showImageLoadingSpinner() { return this.isCurrentFileLoading && this.isCurrentImageAnImage; }
    get showMainImageControls() { return this.hasFiles && !this.isCurrentFileLoading; }
    get currentFileIndexValue() { return this.currentFileIndex.toString(); }
    
    // Full Screen Getters
    get isFullScreenFileAnImage() { return this.isFullScreenPreview && this.currentFile.type === 'image'; }
    get isFullScreenFileAPdf() { return this.isFullScreenPreview && this.currentFile.type === 'pdf'; }
    get isFullScreenPreviousDisabled() { return this.isPreviousDisabled; }
    get isFullScreenNextDisabled() { return this.isNextDisabled; }
    get isFullScreenZoomOutDisabled() { return this.fullScreenScale <= MIN_FULL_SCREEN_SCALE; }
    get fullScreenImageStyle() { return `transform: scale(${this.fullScreenScale}) rotate(${this.currentRotationAngle}deg);`; }

    // --- File Viewer Event Handlers ---
    handleFileSelectionChange(event) {
        const selectedIndex = parseInt(event.detail.value, 10);
        if (!isNaN(selectedIndex) && this.currentFileIndex !== selectedIndex) {
            this.currentFileIndex = selectedIndex;
            this._lastRenderedFileIndex = -1;
            this.resetImageSpecificState();
        }
    }

    handlePreviousImage() { if (this.isPreviousDisabled) return; this.currentFileIndex--; this._lastRenderedFileIndex = -1; this.resetImageSpecificState(); }
    handleNextImage() { if (this.isNextDisabled) return; this.currentFileIndex++; this._lastRenderedFileIndex = -1; this.resetImageSpecificState(); }
    
    enterFullScreen() { if (!this.hasFiles) return; this.fullScreenScale = MIN_FULL_SCREEN_SCALE; this.isFullScreenPreview = true; }
    exitFullScreen() { this.isFullScreenPreview = false; }
    handleKeyDown(event) { if (this.isFullScreenPreview && event.key === 'Escape') { this.exitFullScreen(); } }
    
    handleFullScreenPrevious() { this.handlePreviousImage(); this.fullScreenScale = MIN_FULL_SCREEN_SCALE; }
    handleFullScreenNext() { this.handleNextImage(); this.fullScreenScale = MIN_FULL_SCREEN_SCALE; }
    handleFullScreenZoomIn() { this.fullScreenScale += FULL_SCREEN_ZOOM_STEP; }
    handleFullScreenZoomOut() { this.fullScreenScale = Math.max(MIN_FULL_SCREEN_SCALE, this.fullScreenScale - FULL_SCREEN_ZOOM_STEP); }
    handleFullScreenRotate() { this.currentRotationAngle = (this.currentRotationAngle + 90) % 360; }
    
    resetImageSpecificState() { this.isZoomLocked = false; this.isHoverZoomActive = false; this.currentLockedAdjustedScale = DEFAULT_SCALE; this.currentRotationAngle = 0; this.isPanning = false; }
    initializeCurrentImageDisplay() { if (this.isCurrentImageAnImage) { this.applyImageTransforms(); this.centerAndResetScroll(); } }
    centerAndResetScroll() { const img = this.template.querySelector('img.zoomable-image'); if (img) { img.style.transform = `scale(${DEFAULT_SCALE}) rotate(${this.currentRotationAngle}deg)`; img.style.transformOrigin = '50% 50%'; const wrapper = this.template.querySelector('.scroll-wrapper'); if(wrapper) { wrapper.scrollLeft = 0; wrapper.scrollTop = 0; } } }
    applyImageTransforms() { const img = this.template.querySelector('img.zoomable-image'); if (!img) return; let scale = DEFAULT_SCALE; let originX = '50%'; let originY = '50%'; if (this.isZoomLocked) { scale = this.currentLockedAdjustedScale; originX = this.lockedTransformOriginX; originY = this.lockedTransformOriginY; } else if (this.isHoverZoomActive) { scale = HOVER_ZOOM_SCALE; originX = this.hoverTransformOriginX; originY = this.hoverTransformOriginY; } img.style.transformOrigin = `${originX} ${originY}`; img.style.transform = `scale(${scale}) rotate(${this.currentRotationAngle}deg)`; }
    handleRotateImage() { if (!this.isCurrentImageAnImage) return; this.currentRotationAngle = (this.currentRotationAngle + 90) % 360; if (this.isZoomLocked) { this.applyImageTransforms(); } else { this.initializeCurrentImageDisplay(); } }
    handleImageMouseEnter(event) { if (!this.isCurrentImageAnImage || this.isZoomLocked) return; this.isHoverZoomActive = true; this.updateHoverZoomPosition(event); }
    handleImageMouseMoveForHoverZoom(event) { if (!this.isCurrentImageAnImage || this.isZoomLocked || !this.isHoverZoomActive) return; this.updateHoverZoomPosition(event); }
    handleImageMouseLeave() { if (this.isZoomLocked) return; this.isHoverZoomActive = false; this.applyImageTransforms(); }
    handleImageClickToLock(event) { if (event.target.closest('.image-controls')) return; if (!this.isCurrentImageAnImage || this.isZoomLocked) return; if (this.isHoverZoomActive) { this.isZoomLocked = true; this.currentLockedAdjustedScale = HOVER_ZOOM_SCALE; this.lockedTransformOriginX = this.hoverTransformOriginX; this.lockedTransformOriginY = this.hoverTransformOriginY; this.applyImageTransforms(); } }
    unlockAndResetZoom() { this.resetImageSpecificState(); this.initializeCurrentImageDisplay(); }
    handleLockedZoomIn() { if (!this.isCurrentImageAnImage_and_isZoomLocked) return; this.currentLockedAdjustedScale += LOCKED_ZOOM_STEP; this.applyImageTransforms(); }
    handleLockedZoomOut() { if (!this.isCurrentImageAnImage_and_isZoomLocked) return; this.currentLockedAdjustedScale -= LOCKED_ZOOM_STEP; if (this.currentLockedAdjustedScale <= MIN_LOCKED_EFFECTIVE_SCALE) { this.unlockAndResetZoom(); } else { this.applyImageTransforms(); } }
    updateHoverZoomPosition(event) { const img = this.template.querySelector('img.zoomable-image'); if (!img) return; const width = img.offsetWidth; const height = img.offsetHeight; let x = event.offsetX; let y = event.offsetY; let originX, originY; switch (this.currentRotationAngle) { case 90: originX = `${(y / height) * 100}%`; originY = `${100 - (x / width) * 100}%`; break; case 180: originX = `${100 - (x / width) * 100}%`; originY = `${100 - (y / height) * 100}%`; break; case 270: originX = `${100 - (y / height) * 100}%`; originY = `${(x / width) * 100}%`; break; default: originX = `${(x / width) * 100}%`; originY = `${(y / height) * 100}%`; break; } this.hoverTransformOriginX = originX; this.hoverTransformOriginY = originY; this.applyImageTransforms(); }
    handleViewerMouseDown(event) { if (!this.isCurrentImageAnImage || !event.target.closest('.image-container') || !(this.isZoomLocked || this.isHoverZoomActive)) return; const wrapper = this.template.querySelector('.scroll-wrapper'); if(!wrapper) return; this.isPanning = true; this.panStartX = event.pageX; this.panStartY = event.pageY; this.scrollWrapperScrollLeftStart = wrapper.scrollLeft; this.scrollWrapperScrollTopStart = wrapper.scrollTop; wrapper.style.cursor = 'grabbing'; event.preventDefault(); }
    handleViewerMouseMovePanning(event) { if (!this.isPanning) return; event.preventDefault(); const dx = event.pageX - this.panStartX; const dy = event.pageY - this.panStartY; const wrapper = this.template.querySelector('.scroll-wrapper'); if(wrapper) { wrapper.scrollLeft = this.scrollWrapperScrollLeftStart - dx; wrapper.scrollTop = this.scrollWrapperScrollTopStart - dy; } }
    handleViewerMouseUpPanning() { this.isPanning = false; const wrapper = this.template.querySelector('.scroll-wrapper'); if(wrapper) { wrapper.style.cursor = 'grab'; } }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
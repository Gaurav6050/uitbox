import { LightningElement, track, api, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import { getPicklistValues } from "lightning/uiObjectInfoApi";
import { refreshApex } from '@salesforce/apex';

// --- Apex Imports ---
import getFilesRelatedToCase from '@salesforce/apex/AiTicketModalEnhancedController.getFilesRelatedToCase';
import getUnprocessedFilesForCase from '@salesforce/apex/AiTicketModalEnhancedController.getUnprocessedFilesForCase';
import findAndProcessUnprocessedFiles from '@salesforce/apex/AiTicketModalEnhancedController.findAndProcessUnprocessedFiles';
import invokeAutoLaunchFlow from '@salesforce/apex/FlowLauncher.invokeAutoLaunchFlow';
import saveExtractionLogsApex from '@salesforce/apex/AiTicketModalEnhancedController.saveExtractionLogs';
import searchCourts from '@salesforce/apex/AiTicketModalEnhancedController.searchCourts';
import getStateMaps from '@salesforce/apex/AiTicketModalEnhancedController.getStateMaps';
import createCourt from '@salesforce/apex/AiTicketModalEnhancedController.createCourt';
import updateCourt from '@salesforce/apex/AiTicketModalEnhancedController.updateCourt';
import getStateOptions from '@salesforce/apex/AiTicketModalEnhancedController.getStateOptions';

// --- Schema Imports ---
import CASE_DRIVER_FIELD from '@salesforce/schema/Case.Driver__c';
import CASE_TICKET_FIELD from '@salesforce/schema/Case.Ticket__c';
import CASE_AGENT from "@salesforce/schema/Case.Agent__c";
import CASE_SPECIAL_INSTRUCTIONS from '@salesforce/schema/Case.Special_Instructions_for_Ticket__c';
import CASE_DESCRIPTION_FIELD from '@salesforce/schema/Case.Description';
import TICKET_NUMBER_FIELD from "@salesforce/schema/Ticket__c.Name";
import TICKET_STATUS_FIELD from "@salesforce/schema/Ticket__c.Attorney_Status__c";
import VIOLATION_DESCRIPTION_FIELD from "@salesforce/schema/Ticket__c.Violation_Description__c";
import VIOLATION_CATEGORY_FIELD from "@salesforce/schema/Ticket__c.Violation_Category__c";
import TICKET_TYPE_FIELD from "@salesforce/schema/Ticket__c.TicketType__c";
import ACCIDENT_FIELD from "@salesforce/schema/Ticket__c.Accident__c";
import DRIVER_LICENSE_TYPE_FIELD from "@salesforce/schema/Ticket__c.Drivers_License_Type__c";
import DATE_OF_TICKET_FIELD from "@salesforce/schema/Ticket__c.Date_of_Ticket__c";
import COURT_DATE_FIELD from "@salesforce/schema/Ticket__c.Court_Date__c";
import TICKET_COURT_FIELD from "@salesforce/schema/Ticket__c.Ticket_Court__c";
import COURT_FIELD from "@salesforce/schema/Ticket__c.Court__c";
import COURT_PHONE_NUMBER_FIELD from "@salesforce/schema/Ticket__c.Court_Phone_Number__c";
import TICKET_CITY_FIELD from "@salesforce/schema/Ticket__c.Ticket_City__c";
import TICKET_COUNTRY_FIELD from "@salesforce/schema/Ticket__c.Ticket_County__c";
import TICKET_STATE_FIELD from "@salesforce/schema/Ticket__c.Ticket_State__c";
import CITATION_NUMBER_FIELD from "@salesforce/schema/Ticket__c.Citation_Number__c";
import DATE_ENTERED_FIELD from "@salesforce/schema/Ticket__c.Date_Entered__c";
import DRIVER_FIELD from "@salesforce/schema/Ticket__c.Driver__c";
import DRIVER_COVERAGE_OPPORTUNITY_FIELD from "@salesforce/schema/Ticket__c.Driver_Coverage_Opportunity__c";
import DRIVER_COVERAGE_STATUS_FIELD from "@salesforce/schema/Ticket__c.Driver_Coverage_Status__c";
import OWNER_FIELD from "@salesforce/schema/Ticket__c.OwnerId";
import SPECIAL_COMMENTS_FIELD from "@salesforce/schema/Ticket__c.Special_Instructions__c";
import TICKET_OUTCOME_FIELD from "@salesforce/schema/Ticket__c.Ticket_Outcome__c";
import DEVELOPER_NOTES from "@salesforce/schema/Ticket__c.Developer_Notes__c";
import TICKET_AGENT from "@salesforce/schema/Ticket__c.Agent__c";


// --- Constants ---
const FIELDS_FROM_CASE = [CASE_DRIVER_FIELD, CASE_TICKET_FIELD, CASE_SPECIAL_INSTRUCTIONS, CASE_DESCRIPTION_FIELD, CASE_AGENT];
const SUBSET_OF_FIELDS_TO_PROCESS = new Set([
    'Accident__c', 'Drivers_License_Type__c', 'Citation_Number__c', 'Ticket_State__c', 'Ticket_County__c', 'Ticket_City__c',
    'Court_Phone_Number__c', 'Ticket_Court__c', 'Court_Date__c', 'Violation_Category__c',
    'Violation_Description__c', 'Date_of_Ticket__c'
]);
const COURT_RELATED_FIELD_APIS = new Set([
    'Ticket_Court__c', 'Court_Phone_Number__c', 'Ticket_State__c', 'Ticket_County__c', 'Ticket_City__c'
]);
const DEFAULT_SCALE = 1.0;
const HOVER_ZOOM_SCALE = 1.8;
const LOCKED_ZOOM_STEP = 0.3;
const MIN_LOCKED_EFFECTIVE_SCALE = DEFAULT_SCALE;
const FULL_SCREEN_ZOOM_STEP = 0.25;
const MIN_FULL_SCREEN_SCALE = 1.0;

const FIELD_TYPE_MAPPING = {
    "DATE": "date", "DATETIME": "datetime-local", "EMAIL": "email", "NUMBER": "number",
    "PHONE": "tel", "STRING": "text", "TEXTAREA": "text", "URL": "url",
    "BOOLEAN": "checkbox", "CURRENCY": "number", "PERCENT": "number", "DOUBLE": "number"
};


export default class AiTicketModalEnhanced extends NavigationMixin(LightningElement) {
    @api caseId;
    @api enableManualProcessing = false;

    @track viewState = 'loading';
    @track files = [];
    @track currentFileIndex = 0;
    _lastRenderedFileIndex = -1;
    primaryNeilonFileId = null;
    
    @track isLoadingDriverData = true;
    @track isProcessingSaveAndNext = false; 
    @track isPreparingNextScreen = false;
    @track overallErrorMessage = '';
    @track isCurrentFileLoading = false;
    @track unprocessedFiles = [];
    @track processingSummary = null;

    @track ocrDataFields = [];
    fieldLabels = {};
    fieldDescribes = {};

    @track fieldsErrorMessage = '';
    @track noFieldsDataMessage = '';

    @track currentDriverId = null;
    _caseSpecialInstructions = '';
    _caseDescription = '';
    @track caseCombinedComments = '';
    existingTicketId = null;
    _forceCreate = false;

    // --- Court Lookup & Inline Editor Properties ---
    @track preselectedCourt = null;
    @track selectedCourtId = null;
    @track selectedCourtName = '';
    @track isCourtLoading = true;
    @track isCourtEditorExpanded = false;
    @track editableCourt = {};
    @track courtEditorMode = 'edit';
    @track isSavingCourt = false;
    @track stateOptions = [];
    @track showDuplicateView = false;
    @track duplicateRecord = null;

    // --- Image Viewer Properties ---
    baseTransformOriginX = '50%';
    baseTransformOriginY = '50%';
    isPanning = false;
    panStartX; panStartY;
    scrollWrapperScrollLeftStart;
    scrollWrapperScrollTopStart;
    isHoverZoomActive = false;
    hoverTransformOriginX = '50%';
    hoverTransformOriginY = '50%';
    isZoomLocked = false;
    lockedInitialScale = DEFAULT_SCALE;
    currentLockedAdjustedScale = DEFAULT_SCALE;
    lockedTransformOriginX = '50%';
    lockedTransformOriginY = '50%';
    @track currentRotationAngle = 0;
    isFullScreenPreview = false;
    @track fullScreenScale = MIN_FULL_SCREEN_SCALE;
    imageViewerElement;
    scrollWrapperElement;
    
    caseAgentId;

    _boundHandleMouseUpGlobalPanning;
    _boundHandleKeyDown;
    _originalBodyOverflow = '';

    // --- Flow & Form Properties ---
    flowOppId;
    flowDriverCoverage;
    flowTypeTicket;
    @track showImageAndOcrScreen = true;
    @track showTicketEditFormScreen = false;
    @track ticketSaveErrorFeedback = '';
    @track showTicketOutcomeField = false;
    @track ticketForm_DriverId;
    @track ticketForm_DateOfTicket;
    @track ticketForm_OppId;
    @track ticketForm_DriverCoverage;
    @track ticketForm_TicketType;
    @track ticketForm_CitationNumber;
    @track ticketForm_TicketCity;
    @track ticketForm_TicketCountry;
    @track ticketForm_TicketState;
    @track ticketForm_CourtDate;
    @track ticketForm_TicketCourt;
    @track ticketForm_CourtId;
    @track ticketForm_CourtPhoneNumber;
    @track ticketForm_DateEntered;
    @track ticketForm_Outcome;
    @track ticketForm_ViolationDescription;
    @track ticketForm_ViolationCategory;
    @track ticketForm_Accident;
    @track ticketForm_DriverLicenseType;
    @track ticketForm_TicketStatus;
    @track ticketForm_Comments;
    @track ticketForm_DeveloperNotes;
    @track ticketForm_Agent;
    createComplianceChallengeRecord = false;
    showNewTicketSpinner = false;

    stateNameToAbbrMap = {};
    stateAbbrToNameMap = {};

    _wiredFilesResult;
    _wiredViolationPicklistResult;
    _wiredAccidentPicklistResult;
    _wiredLicenseTypePicklistResult;

    @track violationCategoryOptions = [];
    @track accidentOptions = [];
    @track driverLicenseTypeOptions = [];

    ticketFields = {
        ticketNumber: TICKET_NUMBER_FIELD.fieldApiName,
        ticketStatus: TICKET_STATUS_FIELD.fieldApiName,
        violationDescription: VIOLATION_DESCRIPTION_FIELD.fieldApiName,
        violationCategory: VIOLATION_CATEGORY_FIELD.fieldApiName,
        ticketType: TICKET_TYPE_FIELD.fieldApiName,
        accident: ACCIDENT_FIELD.fieldApiName,
        driverLicenseType: DRIVER_LICENSE_TYPE_FIELD.fieldApiName,
        dateOfTicket: DATE_OF_TICKET_FIELD.fieldApiName,
        courtDate: COURT_DATE_FIELD.fieldApiName,
        ticketCourt: TICKET_COURT_FIELD.fieldApiName,
        court: COURT_FIELD.fieldApiName,
        courtPhoneNumber: COURT_PHONE_NUMBER_FIELD.fieldApiName,
        ticketCity: TICKET_CITY_FIELD.fieldApiName,
        ticketCountry: TICKET_COUNTRY_FIELD.fieldApiName,
        ticketState: TICKET_STATE_FIELD.fieldApiName,
        citationNumber: CITATION_NUMBER_FIELD.fieldApiName,
        dateEntered: DATE_ENTERED_FIELD.fieldApiName,
        driver: DRIVER_FIELD.fieldApiName,
        driverCoverageOpportunity: DRIVER_COVERAGE_OPPORTUNITY_FIELD.fieldApiName,
        driverCoverageStatus: DRIVER_COVERAGE_STATUS_FIELD.fieldApiName,
        ownerId: OWNER_FIELD.fieldApiName,
        comments: SPECIAL_COMMENTS_FIELD.fieldApiName,
        outcome: TICKET_OUTCOME_FIELD.fieldApiName,
        developerNotes: DEVELOPER_NOTES.fieldApiName,
        agent: TICKET_AGENT.fieldApiName
    };

    // --- GETTERS ---

    get showOverallSpinner() {
        return this.isProcessingSaveAndNext || this.isSavingCourt;
    }

    get isCourtIncomplete() {
        if (!this.preselectedCourt) return false;
        return !this.preselectedCourt.Address__Street__s || !this.preselectedCourt.Address__PostalCode__s || !this.preselectedCourt.Address__City__s;
    }

    get expandIconName() {
        return this.isCourtEditorExpanded ? 'utility:dash' : 'utility:edit';
    }

    get courtEditorTitle() {
        return this.courtEditorMode === 'create' ? 'New Court Details' : 'Edit Court Details';
    }

    get changesToDisplay() {
        if (!this.duplicateRecord) return [];
        const changes = [];
        const fieldsToCompare = [
            { label: 'Name', formValue: this.editableCourt.Name, recordValue: this.duplicateRecord.Name },
            { label: 'Phone', formValue: this.editableCourt.Phone__c, recordValue: this.duplicateRecord.Phone__c },
            { label: 'County', formValue: this.editableCourt.County__c, recordValue: this.duplicateRecord.County__c },
            { label: 'Street', formValue: this.editableCourt.Address__Street__s, recordValue: this.duplicateRecord.Address__Street__s },
            { label: 'City', formValue: this.editableCourt.Address__City__s, recordValue: this.duplicateRecord.Address__City__s },
            { label: 'State', formValue: this.editableCourt.Address__StateCode__s, recordValue: this.duplicateRecord.Address__StateCode__s },
            { label: 'ZIP Code', formValue: this.editableCourt.Address__PostalCode__s, recordValue: this.duplicateRecord.Address__PostalCode__s }
        ];

        fieldsToCompare.forEach(field => {
            const formVal = field.formValue || '';
            const recordVal = field.recordValue || '';
            if (formVal !== recordVal) {
                changes.push({
                    label: field.label,
                    oldValue: recordVal || '(empty)',
                    newValue: formVal || '(empty)'
                });
            }
        });
        return changes;
    }

    get hasChanges() {
        return this.changesToDisplay.length > 0;
    }

    get isUpdateButtonDisabled() {
        return !this.hasChanges || this.isSavingCourt;
    }

    get courtRelatedFields() {
        return this.ocrDataFields.filter(field => COURT_RELATED_FIELD_APIS.has(field.fieldName));
    }

    get otherOcrFields() {
        return this.ocrDataFields.filter(field => !COURT_RELATED_FIELD_APIS.has(field.fieldName));
    }

    @wire(getRecord, { recordId: '$caseId', fields: FIELDS_FROM_CASE })
    wiredCaseData({ error, data }) {
        this.isLoadingDriverData = true;
        if (data) {
            this.currentDriverId = getFieldValue(data, CASE_DRIVER_FIELD);
            this.existingTicketId = getFieldValue(data, CASE_TICKET_FIELD);
            this._caseSpecialInstructions = getFieldValue(data, CASE_SPECIAL_INSTRUCTIONS);
            this._caseDescription = getFieldValue(data, CASE_DESCRIPTION_FIELD);
            this.caseAgentId = getFieldValue(data, CASE_AGENT);
            
            let combined = this._caseSpecialInstructions || '';
            if (this._caseDescription) {
                combined = combined ? `${combined}\n${this._caseDescription}` : this._caseDescription;
            }
            this.caseCombinedComments = combined;

            this.isLoadingDriverData = false;
        } else if (error) {
            this.fieldsErrorMessage = (this.fieldsErrorMessage ? this.fieldsErrorMessage + ' ' : '') + 'Could not load initial Case information.';
            this.isLoadingDriverData = false;
        }
    }

    @wire(getFilesRelatedToCase, { caseId: '$caseId' })
    wiredFiles(result) {
        this._wiredFilesResult = result;
        this._processDataWhenReady();
    }

    @wire(getPicklistValues, { recordTypeId: '012000000000000AAA', fieldApiName: VIOLATION_CATEGORY_FIELD })
    wiredViolationCategory(result) {
        this._wiredViolationPicklistResult = result;
        if (result.data) {
            this.violationCategoryOptions = result.data.values.map(value => ({label: value.label, value: value.value}));
        }
        this._processDataWhenReady();
    }

    @wire(getPicklistValues, { recordTypeId: '012000000000000AAA', fieldApiName: ACCIDENT_FIELD })
    wiredAccident(result) {
        this._wiredAccidentPicklistResult = result;
        if (result.data) {
            this.accidentOptions = result.data.values.map(value => ({label: value.label, value: value.value}));
        }
        this._processDataWhenReady();
    }

    @wire(getPicklistValues, { recordTypeId: '012000000000000AAA', fieldApiName: DRIVER_LICENSE_TYPE_FIELD })
    wiredDriverLicenseType(result) {
        this._wiredLicenseTypePicklistResult = result;
        if (result.data) {
            this.driverLicenseTypeOptions = result.data.values.map(value => ({label: value.label, value: value.value}));
        }
        this._processDataWhenReady();
    }

    @wire(getStateMaps)
    wiredStateMaps({ error, data }) {
        if (data) {
            this.stateNameToAbbrMap = data.nameToAbbreviation;
            this.stateAbbrToNameMap = data.abbreviationToName;
        } else if (error) {
            this.showToast('Error', 'Could not load state conversion maps.', 'error');
        }
    }

    @wire(getStateOptions)
    wiredStateOptions({ error, data }) {
        if (data) {
            this.stateOptions = data;
        } else if (error) {
            this.showToast('Error', 'Could not load state list.', 'error');
        }
    }
    
    _processDataWhenReady() {
        if (!this._wiredFilesResult || !this._wiredViolationPicklistResult || !this._wiredAccidentPicklistResult || !this._wiredLicenseTypePicklistResult) {
            return;
        }

        if (this.existingTicketId && !this._forceCreate) {
            this.viewState = 'ticketExists';
            return;
        }

        if (this._wiredFilesResult.error) {
            this.overallErrorMessage = this.getFriendlyErrorMessage(this._wiredFilesResult.error);
            this.viewState = 'error';
            return;
        }

        if (this._wiredFilesResult.data) {
            const data = this._wiredFilesResult.data;
            this.fieldLabels = data.fieldLabels || {};
            this.fieldDescribes = data.fieldDescribes || {};

            if (data.files && data.files.length > 0) {
                this.files = data.files.map(file => {
                    const isPdf = file.Name && file.Name.toLowerCase().endsWith('.pdf');
                    return {
                        id: file.Id, 
                        url: file.NEILON__File_Presigned_URL__c,
                        name: file.Name || 'Untitled Document',
                        ocrResponseString: file.OCR_Response__c,
                        type: isPdf ? 'pdf' : 'image'
                    };
                });
                
                this.currentFileIndex = 0;
                this._lastRenderedFileIndex = -1;
                this.primaryNeilonFileId = this.files[0]?.id || null;
                
                this.processCombinedOcrData(this.files);
                this.viewState = 'viewer';
            } else {
                if (this.enableManualProcessing) {
                    this.checkForUnprocessedFiles();
                } else {
                    this.viewState = 'noFilesStatic';
                }
            }
        }
    }

    processCombinedOcrData(files) {
        this.ocrDataFields = [];
        this.fieldsErrorMessage = '';
        this.noFieldsDataMessage = '';
        this.isCourtLoading = true;
        this.preselectedCourt = null;
        this.selectedCourtId = null;
        this.selectedCourtName = '';

        if (!files || files.length === 0) {
            this.noFieldsDataMessage = 'No files available to process.';
            this.isCourtLoading = false;
            return;
        }

        const bestOcrResults = new Map();
        files.forEach(file => {
            if (file.ocrResponseString) {
                try {
                    const parsedOcr = JSON.parse(file.ocrResponseString);
                    if (parsedOcr && typeof parsedOcr === 'object') {
                        for (const key in parsedOcr) {
                            if (SUBSET_OF_FIELDS_TO_PROCESS.has(key)) {
                                const currentFieldData = parsedOcr[key];
                                if (currentFieldData && currentFieldData.value != null && typeof currentFieldData.confidence_score === 'number') {
                                    if (!bestOcrResults.has(key) || currentFieldData.confidence_score > bestOcrResults.get(key).confidence_score) {
                                        bestOcrResults.set(key, currentFieldData);
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error(`Error parsing OCR JSON for file ${file.name}:`, e);
                    this.fieldsErrorMessage = (this.fieldsErrorMessage ? this.fieldsErrorMessage + '; ' : '') + `Invalid OCR data in file ${file.name}.`;
                }
            }
        });

        if (bestOcrResults.size === 0) {
            this.noFieldsDataMessage = 'No valid OCR data found in the specified fields across all files.';
            this.isCourtLoading = false;
            return;
        }

        const initialName = bestOcrResults.get('Ticket_Court__c')?.value;
        const initialPhone = bestOcrResults.get('Court_Phone_Number__c')?.value;
        const initialCounty = bestOcrResults.get('Ticket_County__c')?.value;

        searchCourts({ searchTerm: '', offset: 0, initialName, initialPhone, initialCounty })
            .then(result => {
                if (result.preselectedCourt) {
                    this.preselectedCourt = result.preselectedCourt;
                    this.selectedCourtId = result.preselectedCourt.Id;
                    this.selectedCourtName = result.preselectedCourt.Name;
                    this.updateCourtRelatedFields(result.preselectedCourt);
                }
            })
            .catch(error => {
                this.fieldsErrorMessage += ' Could not pre-select court. ' + this.getFriendlyErrorMessage(error);
            })
            .finally(() => {
                this.isCourtLoading = false;
            });

        const finalFields = [];
        const picklistFieldMap = {
            [VIOLATION_CATEGORY_FIELD.fieldApiName]: this.violationCategoryOptions,
            [ACCIDENT_FIELD.fieldApiName]: this.accidentOptions,
            [DRIVER_LICENSE_TYPE_FIELD.fieldApiName]: this.driverLicenseTypeOptions
        };

        SUBSET_OF_FIELDS_TO_PROCESS.forEach((fieldName, index) => {
            if (bestOcrResults.has(fieldName)) {
                const bestData = bestOcrResults.get(fieldName);
                const sfdcFieldType = this.fieldDescribes[fieldName]?.fieldType.toUpperCase() || 'STRING';
                let inputType = FIELD_TYPE_MAPPING[sfdcFieldType] || 'text';
                let displayValue = bestData.value;
                let extractedValueForLog = bestData.value;
                let aiReason = bestData?.ai_reason ?? '';
                let isPicklist = picklistFieldMap.hasOwnProperty(fieldName);

                if (inputType === 'date') {
                    displayValue = this._formatDateToYyyyMmDd(displayValue);
                    extractedValueForLog = displayValue;
                }

                if (isPicklist) {
                    const options = picklistFieldMap[fieldName];
                    if (options && options.length > 0) {
                        const ocrLabel = bestData.value?.toString().toLowerCase().trim();
                        if (ocrLabel) {
                            const matchingOption = options.find(opt => opt.label.toLowerCase().trim() === ocrLabel);
                            displayValue = matchingOption ? matchingOption.value : null;
                        } else {
                            displayValue = null;
                        }
                    }
                }

                finalFields.push({
                    id: `${fieldName}-${index}`,
                    fieldName: fieldName,
                    fieldLabel: this.fieldLabels[fieldName.toLowerCase()] || fieldName.replace(/__/g, ' ').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                    extractedValue: extractedValueForLog,
                    currentValue: displayValue,
                    isAccurate: true,
                    reviewerNotes: '',
                    sfdcFieldType: sfdcFieldType,
                    inputType: inputType,
                    inputStep: (inputType === 'number' && ['CURRENCY', 'DOUBLE', 'PERCENT'].includes(sfdcFieldType)) ? 'any' : null,
                    inputFormatter: (sfdcFieldType === 'CURRENCY') ? 'currency' : (sfdcFieldType === 'PERCENT') ? 'percent-fixed' : null,
                    showReviewerNotes: false,
                    aiReason: aiReason,
                    isPicklist: isPicklist,
                    picklistOptions: isPicklist ? picklistFieldMap[fieldName] : []
                });
            }
        });
        this.ocrDataFields = finalFields;
    }

    updateCourtRelatedFields(courtRecord) {
        const newOcrDataFields = [...this.ocrDataFields];

        const fieldMapping = {
            'Name': 'Ticket_Court__c',
            'County__c': 'Ticket_County__c',
            'Phone__c': 'Court_Phone_Number__c',
            'Address__City__s': 'Ticket_City__c',
            'Address__StateCode__s': 'Ticket_State__c'
        };

        for (const sourceField in fieldMapping) {
            const targetFieldName = fieldMapping[sourceField];
            const fieldToUpdate = newOcrDataFields.find(f => f.fieldName === targetFieldName);
            
            if (fieldToUpdate) {
                let newValue = courtRecord ? courtRecord[sourceField] : null;
                
                if (targetFieldName === 'Ticket_State__c' && newValue && this.stateAbbrToNameMap) {
                    newValue = this.stateAbbrToNameMap[newValue.toUpperCase()] || newValue;
                }

                fieldToUpdate.currentValue = newValue;
                fieldToUpdate.isAccurate = true;
            }
        }
        this.ocrDataFields = newOcrDataFields;
    }

    handleOcrFieldChange(event) {
        const fieldId = event.target.dataset.id;
        const fieldPropertyToUpdate = event.target.dataset.fieldproperty;
        let newValue = event.target.value;

        const fieldIndex = this.ocrDataFields.findIndex(f => f.id === fieldId);

        if (fieldIndex > -1) {
            const newOcrDataFields = [...this.ocrDataFields];
            const fieldObject = { ...newOcrDataFields[fieldIndex] };
            fieldObject[fieldPropertyToUpdate] = newValue;

            if (fieldPropertyToUpdate === 'currentValue') {
                if (fieldObject.isPicklist) {
                    const selectedOption = fieldObject.picklistOptions.find(opt => opt.value === newValue);
                    fieldObject.isAccurate = selectedOption ? selectedOption.label.toLowerCase().trim() === String(fieldObject.extractedValue).toLowerCase().trim() : false;
                } else {
                    fieldObject.isAccurate = String(newValue) === String(fieldObject.extractedValue);
                }
            }
            
            newOcrDataFields[fieldIndex] = fieldObject;
            this.ocrDataFields = newOcrDataFields;

            const changedFieldName = fieldObject.fieldName;
            if (COURT_RELATED_FIELD_APIS.has(changedFieldName) && fieldPropertyToUpdate === 'currentValue') {
                const lookup = this.template.querySelector('c-custom-court-lookup');
                if (lookup) {
                    lookup.clearSelection();
                }
                this.selectedCourtId = null;
                this.selectedCourtName = '';
            }
        }
    }

    // --- Court Handlers ---

    handleCourtSelectionChange(event) {
        const selectedRecord = event.detail.selectedRecord;
        this.isCourtEditorExpanded = false;
        this.showDuplicateView = false;
        if (selectedRecord) {
            this.selectedCourtId = selectedRecord.Id;
            this.selectedCourtName = selectedRecord.Name;
            this.updateCourtRelatedFields(selectedRecord);
            this.preselectedCourt = selectedRecord;
        } else {
            this.selectedCourtId = null;
            this.selectedCourtName = '';
            this.preselectedCourt = null;
        }
    }

    handleRequestNewCourt() {
        this.courtEditorMode = 'create';
        this.selectedCourtId = null;
        this.preselectedCourt = null;
        this.template.querySelector('c-custom-court-lookup').clearSelection();

        const getOcrValue = (fieldName) => {
            const field = this.ocrDataFields.find(f => f.fieldName === fieldName);
            return field ? field.currentValue : '';
        };

        let stateName = getOcrValue('Ticket_State__c');
        
        this.editableCourt = {
            Name: getOcrValue('Ticket_Court__c'),
            Phone__c: getOcrValue('Court_Phone_Number__c'),
            County__c: getOcrValue('Ticket_County__c'),
            Address__City__s: getOcrValue('Ticket_City__c'),
            Address__StateCode__s: this._normalizeStateToAbbreviation(stateName)
        };

        this.isCourtEditorExpanded = true;
        this.showDuplicateView = false;
    }

    handleToggleCourtEditor() {
        this.isCourtEditorExpanded = !this.isCourtEditorExpanded;
        if (this.isCourtEditorExpanded) {
            this.courtEditorMode = 'edit';
            this.editableCourt = { ...this.preselectedCourt };
            this.showDuplicateView = false;
        }
    }

    handleCourtFieldChange(event) {
        const field = event.target.dataset.field;
        this.editableCourt[field] = event.target.value;
    }

    handleCancelCourtEdit() {
        this.isCourtEditorExpanded = false;
        this.editableCourt = {};
        this.showDuplicateView = false;
        this.duplicateRecord = null;
    }

    handleGoogleSearchClick() {
        const phone = this.editableCourt.Phone__c || '';
        const name = this.editableCourt.Name || '';
        const query = `${phone} ${name}`.trim();

        if (query) {
            const encodedQuery = encodeURIComponent(query);
            const url = `https://www.google.com/search?q=${encodedQuery}`;
            window.open(url, '_blank');
        } else {
            this.showToast('Info', 'Enter a Court Name or Phone to search on Google.', 'warning');
        }
    }

    async handleSaveCourtEdit() {
        if (!this.editableCourt.Name || !this.editableCourt.Phone__c || !this.editableCourt.Address__StateCode__s) {
            this.showToast('Required Field', 'Court Name, Phone, and State are required.', 'error');
            return;
        }
        this.isSavingCourt = true;

        const params = {
            courtName: this.editableCourt.Name,
            phone: this.editableCourt.Phone__c,
            county: this.editableCourt.County__c,
            city: this.editableCourt.Address__City__s,
            stateCode: this.editableCourt.Address__StateCode__s,
            street: this.editableCourt.Address__Street__s,
            zipCode: this.editableCourt.Address__PostalCode__s
        };

        try {
            let result;
            if (this.courtEditorMode === 'create') {
                result = await createCourt(params);
            } else {
                params.courtId = this.selectedCourtId;
                result = await updateCourt(params);
            }

            if (result.isSuccess) {
                this.handleCourtSaveSuccess(result.record, this.courtEditorMode === 'create' ? 'created' : 'updated');
            } else if (result.isDuplicate) {
                this.duplicateRecord = result.duplicateRecord;
                this.showDuplicateView = true;
            }
        } catch (error) {
            this.showToast('Error Saving Court', this.getFriendlyErrorMessage(error), 'error');
        } finally {
            this.isSavingCourt = false;
        }
    }

    handleCourtSaveSuccess(record, action) {
        this.showToast('Success', `Court "${record.Name}" was ${action}.`, 'success');
        
        this.selectedCourtId = record.Id;
        this.selectedCourtName = record.Name;
        this.updateCourtRelatedFields(record);

        // Force reactivity in the child component by clearing and resetting the property with a new object reference.
        this.preselectedCourt = null; 
        this.preselectedCourt = { ...record };

        this.isCourtEditorExpanded = false;
        this.showDuplicateView = false;
        this.duplicateRecord = null;
    }

    // --- Duplicate View Handlers ---
    handleGoBackClick() {
        this.showDuplicateView = false;
        this.duplicateRecord = null;
    }

    handleUseExistingClick() {
        this.handleCourtSaveSuccess(this.duplicateRecord, 'selected');
    }

    async handleUpdateAndUseClick() {
        this.isSavingCourt = true;
        const params = {
            courtId: this.duplicateRecord.Id,
            courtName: this.editableCourt.Name,
            phone: this.editableCourt.Phone__c,
            county: this.editableCourt.County__c,
            city: this.editableCourt.Address__City__s,
            stateCode: this.editableCourt.Address__StateCode__s,
            street: this.editableCourt.Address__Street__s,
            zipCode: this.editableCourt.Address__PostalCode__s
        };

        try {
            const result = await updateCourt(params);
            if (result.isSuccess) {
                this.handleCourtSaveSuccess(result.record, 'updated and selected');
            }
        } catch (error) {
            this.showToast('Error Updating Court', this.getFriendlyErrorMessage(error), 'error');
        } finally {
            this.isSavingCourt = false;
        }
    }

    handleOpenRecordInNewTabClick() {
        this[NavigationMixin.GenerateUrl]({
            type: 'standard__recordPage',
            attributes: {
                recordId: this.duplicateRecord.Id,
                actionName: 'view',
            },
        }).then(url => {
            window.open(url, "_blank");
        });
    }

    async handleSaveAndNext() {
        if (!this.selectedCourtId) {
            this.showToast('Missing Information', 'Please select a Ticket Court before proceeding.', 'error');
            return;
        }

        this.isProcessingSaveAndNext = true;
        this.isPreparingNextScreen = true;

        try {
            const finalValuesMap = new Map();
            this.ocrDataFields.forEach(field => {
                finalValuesMap.set(field.fieldName, field.currentValue);
            });

            let dateOfTicketValue = finalValuesMap.get(DATE_OF_TICKET_FIELD.fieldApiName);
            let dateOfTicket = dateOfTicketValue ? new Date(dateOfTicketValue) : null;
            
            const result = await invokeAutoLaunchFlow({ Driver: this.currentDriverId, DateOfTicket: dateOfTicket });
            this.flowOppId = result?.OppId;
            this.flowDriverCoverage = result?.DriverCoverage;
            this.flowTypeTicket = result?.TypeTicket;
            
            this.ticketForm_DriverId = this.currentDriverId;
            this.ticketForm_OppId = this.flowOppId;
            this.ticketForm_DriverCoverage = this.flowDriverCoverage;
            this.ticketForm_TicketType = this.flowTypeTicket;
            
            this.ticketForm_DateOfTicket = this._formatDateToYyyyMmDd2(finalValuesMap.get(DATE_OF_TICKET_FIELD.fieldApiName));
            this.ticketForm_CourtDate = this._formatDateToYyyyMmDd2(finalValuesMap.get(COURT_DATE_FIELD.fieldApiName));
            
            this.ticketForm_TicketCourt = this.selectedCourtName;
            this.ticketForm_CourtId = this.selectedCourtId;
            this.ticketForm_CitationNumber = finalValuesMap.get(CITATION_NUMBER_FIELD.fieldApiName);
            this.ticketForm_TicketCity = finalValuesMap.get(TICKET_CITY_FIELD.fieldApiName);
            this.ticketForm_ViolationDescription = finalValuesMap.get(VIOLATION_DESCRIPTION_FIELD.fieldApiName);
            this.ticketForm_ViolationCategory = finalValuesMap.get(VIOLATION_CATEGORY_FIELD.fieldApiName);
            this.ticketForm_Accident = finalValuesMap.get(ACCIDENT_FIELD.fieldApiName);
            this.ticketForm_DriverLicenseType = finalValuesMap.get(DRIVER_LICENSE_TYPE_FIELD.fieldApiName);
            this.ticketForm_TicketStatus = finalValuesMap.get(TICKET_STATUS_FIELD.fieldApiName);
            this.ticketForm_Outcome = finalValuesMap.get(TICKET_OUTCOME_FIELD.fieldApiName);
            this.ticketForm_Comments = this.caseCombinedComments;
            this.ticketForm_TicketCountry = finalValuesMap.get(TICKET_COUNTRY_FIELD.fieldApiName);
            this.ticketForm_CourtPhoneNumber = finalValuesMap.get(COURT_PHONE_NUMBER_FIELD.fieldApiName);
            this.ticketForm_TicketState = finalValuesMap.get(TICKET_STATE_FIELD.fieldApiName);

            if(this.ticketForm_TicketStatus) {
                 this.showTicketOutcomeField = (this.ticketForm_TicketStatus === 'Ticket Closed');
            } else {
                this.showTicketOutcomeField = false;
            }
            this.showImageAndOcrScreen = false;
            this.showTicketEditFormScreen = true;
            this.ticketSaveErrorFeedback = '';

            setTimeout(() => {
                this.isPreparingNextScreen = false;
            }, 100);

        } catch (error) {
            this.showToast('Error', 'An error occurred while processing: ' + this.getFriendlyErrorMessage(error), 'error');
            this.isPreparingNextScreen = false;
        } finally {
            this.isProcessingSaveAndNext = false; 
        }
    }

    async checkForUnprocessedFiles() { 
        try {
            this.unprocessedFiles = await getUnprocessedFilesForCase({ caseId: this.caseId });
            if (this.unprocessedFiles && this.unprocessedFiles.length > 0) {
                this.viewState = 'noFilesInitial';
            } else {
                this.viewState = 'noFilesStatic';
            }
        } catch (error) {
            this.overallErrorMessage = this.getFriendlyErrorMessage(error);
            this.viewState = 'error';
        }
    }
    async handleProcessFiles() { 
        this.viewState = 'processing';
        try {
            this.processingSummary = await findAndProcessUnprocessedFiles({ caseId: this.caseId });
            this.viewState = 'summary';
        } catch (error) {
            this.overallErrorMessage = this.getFriendlyErrorMessage(error);
            this.viewState = 'error';
        }
    }
    handleContinueFromSummary() { 
        this.viewState = 'loading';
        refreshApex(this._wiredFilesResult);
    }

    get showLoadingView() { return this.viewState === 'loading'; }
    get showNoFilesInitialView() { return this.viewState === 'noFilesInitial'; }
    get showNoFilesStaticView() { return this.viewState === 'noFilesStatic'; }
    get showProcessingView() { return this.viewState === 'processing'; }
    get showSummaryView() { return this.viewState === 'summary'; }
    get showErrorView() { return this.viewState === 'error'; }
    get showViewer() { return this.viewState === 'viewer'; }
    get showTicketExistsView() { return this.viewState === 'ticketExists'; }
    get hasUnprocessedFiles() { return this.unprocessedFiles && this.unprocessedFiles.length > 0; }
    get isProcessFilesButtonDisabled() { return !this.hasUnprocessedFiles; }
    get hasSuccessfulParsing() { return this.processingSummary && this.processingSummary.some(r => r.success && r.fileType === 'Ticket'); }
    get isContinueFromSummaryDisabled() { return !this.hasSuccessfulParsing; }
    get processingSummaryForDisplay() {
        if (!this.processingSummary) return [];
        return this.processingSummary.map(result => {
            const themeClass = result.success ? 'slds-theme_success' : 'slds-theme_error';
            return { ...result, icon: result.success ? 'doctype:image' : 'doctype:unknown', badgeLabel: result.success ? 'Success' : 'Failed', badgeClass: `slds-badge ${themeClass}` };
        });
    }
    get hasFiles() { return this.files && this.files.length > 0; }
    get isSaveAndNextDisabled() { return this.isProcessingSaveAndNext || !this.hasFiles; }
    get showFileLoadingSpinner() { return this.isLoadingApexData; }
    get showImageLoadingSpinner() { return this.isCurrentFileLoading && this.isCurrentImageAnImage && !this.isProcessingSaveAndNext; }
    get showMainImageControls() { return this.hasFiles && !this.isCurrentFileLoading; }
    get showOcrFieldsHeader() { return this.hasFiles; }
    get showMainOverallFieldsLoading() { return (this.isLoadingDriverData) && !this.overallErrorMessage; }
    get showMainFieldsErrorMessage() { return this.fieldsErrorMessage && !this.isProcessingSaveAndNext; }
    get showMainNoOcrDataMessage() { return this.showNoOcrDataMessage && !this.isProcessingSaveAndNext; }
    get modalContainerClasses() { return `slds-modal__container${this.showNewTicketSpinner || this.isPreparingNextScreen ? ' slds-is-relative' : ''}`; }
    get imageElement() { return this.template.querySelector('img.zoomable-image'); }
    get totalImages() { return this.files ? this.files.length : 0; }
    get currentImageNumber() { return this.totalImages > 0 ? this.currentFileIndex + 1 : 0; }
    get hasMultipleImages() { return this.totalImages > 1; }
    get isPreviousDisabled() { return this.currentFileIndex === 0; }
    get isNextDisabled() { return this.currentFileIndex >= this.totalImages - 1; }
    get currentFile() { return (this.files && this.files.length > this.currentFileIndex) ? this.files[this.currentFileIndex] : {}; }
    get currentFileUrl() { return this.currentFile.url; }
    get isCurrentImageAnImage() { return this.currentFile.type === 'image'; }
    get isCurrentImageAPdf() { return this.currentFile.type === 'pdf'; }
    get isCurrentImageAnImage_and_isZoomLocked() { return this.isCurrentImageAnImage && this.isZoomLocked; }
    get currentImageName() { return this.currentFile.name || 'N/A'; }
    get currentImageNameForHeader() {
        if (this.viewState === 'loading') return 'Loading Files...';
        if (this.viewState === 'error') return 'Error Loading Files';
        if (!this.hasFiles) return 'No Files';
        return this.currentFile.name || 'N/A';
    }
    get showOcrDataFieldsList() { return !this.isLoadingApexData && !this.overallErrorMessage && !this.fieldsErrorMessage && !this.noFieldsDataMessage && this.ocrDataFields && this.ocrDataFields.length > 0; }
    get showNoOcrDataMessage() { return !this.isLoadingApexData && !this.overallErrorMessage && !this.fieldsErrorMessage && this.noFieldsDataMessage; }
    get isFullScreenFileAnImage() { return this.isFullScreenPreview && this.currentFile.type === 'image'; }
    get isFullScreenFileAPdf() { return this.isFullScreenPreview && this.currentFile.type === 'pdf'; }
    get isFullScreenPreviousDisabled() { return this.currentFileIndex === 0; }
    get isFullScreenNextDisabled() { return this.currentFileIndex >= this.totalImages - 1; }
    get isFullScreenZoomOutDisabled() { return this.fullScreenScale <= MIN_FULL_SCREEN_SCALE; }
    get fullScreenImageStyle() { return `transform: scale(${this.fullScreenScale}) rotate(${this.currentRotationAngle}deg);`; }

    // --- Lifecycle Hooks ---
    connectedCallback() {
        this._originalBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        this._boundHandleMouseUpGlobalPanning = this.handleViewerMouseUpPanning.bind(this);
        this._boundHandleKeyDown = this.handleKeyDown.bind(this);
        document.addEventListener('mouseup', this._boundHandleMouseUpGlobalPanning);
        document.addEventListener('keydown', this._boundHandleKeyDown);
    }
    disconnectedCallback() {
        document.body.style.overflow = this._originalBodyOverflow;

        document.removeEventListener('mouseup', this._boundHandleMouseUpGlobalPanning);
        document.removeEventListener('keydown', this._boundHandleKeyDown);
    }
    renderedCallback() {
        if (this.currentFileIndex !== this._lastRenderedFileIndex && this.viewState === 'viewer') {
            this._lastRenderedFileIndex = this.currentFileIndex;
            this.initializeCurrentImageDisplay();
        }
    }

    // --- Helper & Utility Methods ---
    _normalizeStateToAbbreviation(stateInput) {
        if (!stateInput || !this.stateOptions || this.stateOptions.length === 0) return null;
        const trimmedInput = stateInput.trim();
        const upperInput = trimmedInput.toUpperCase();
        const directMatch = this.stateOptions.find(opt => opt.value === upperInput);
        if (directMatch) return directMatch.value;
        const lowerInput = trimmedInput.toLowerCase();
        const nameMatch = this.stateOptions.find(opt => opt.label.toLowerCase() === lowerInput);
        if (nameMatch) return nameMatch.value;
        return null;
    }

    _resetComponentState() {
        this.viewState = 'loading';
        this.files = [];
        this.currentFileIndex = 0;
        this._lastRenderedFileIndex = -1;
        this.ocrDataFields = [];
        this.overallErrorMessage = '';
        this.fieldsErrorMessage = '';
        this.noFieldsDataMessage = '';
        this.isProcessingSaveAndNext = false;
        this.resetImageSpecificState();
    }
    getFriendlyErrorMessage(error) {
        let message = 'An unknown error occurred.';
        if (error) {
            if (error.body && error.body.message) {
                message = error.body.message;
            } else if (error.message) {
                message = error.message;
            } else if (typeof error === 'string') {
                message = error;
            }
        }
        return message;
    }
    _formatDateToYyyyMmDd(dateString) {
        if (!dateString) return null;
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) {
                const parts = dateString.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
                if (parts) {
                    const dt = new Date(parts[3], parts[1] - 1, parts[2]);
                    return dt.toISOString().split('T')[0];
                }
                return dateString;
            }
            return date.toISOString().split('T')[0];
        } catch (e) {
            return dateString;
        }
    }
    _formatDateToYyyyMmDd2(dateString) {
        if (!dateString) return null;
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString;
            const userTimezoneOffset = date.getTimezoneOffset() * 60000;
            const adjustedDate = new Date(date.getTime() + userTimezoneOffset);
            return adjustedDate.toISOString().split('T')[0];
        } catch (e) {
            return dateString;
        }
    }
    showToast(title, message, variant) { this.dispatchEvent(new ShowToastEvent({ title, message, variant })); }

    // --- Event Handlers ---
    handleImageLoadSuccess() {
        this.isCurrentFileLoading = false;
        this.centerAndResetScroll();
    }
    handleImageLoadError(fileName) {
        this.isCurrentFileLoading = false;
        this.showToast('Image Error', `Could not load the image: ${fileName}`, 'error');
    }
    handleDriverFieldFormChange(event) {
        this.currentDriverId = String(event.detail.value);
    }
    handleClose() {
        this.dispatchEvent(new CustomEvent('closemodal'));
    }
    handleCancel() {
        this.handleClose();
    }
    handleGoToPreviousScreen() {
        this.showImageAndOcrScreen = true;
        this.showTicketEditFormScreen = false;
    }
    handleOpenExistingTicket() {
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: {
                recordId: this.existingTicketId,
                objectApiName: 'Ticket__c',
                actionName: 'view'
            }
        });
        this.handleClose();
    }
    handleProceedToCreate() {
        this._forceCreate = true;
        this.viewState = 'loading';
        this._processDataWhenReady();
    }

    // --- Image Viewer Handlers ---
    enterFullScreen() {
        this.isFullScreenPreview = true;
        document.body.style.overflow = 'hidden';
    }
    exitFullScreen() {
        this.isFullScreenPreview = false;
    }
    handleKeyDown(event) {
        if (!this.isFullScreenPreview) return;
        switch (event.key) {
            case 'Escape': this.exitFullScreen(); break;
            case 'ArrowLeft': this.handleFullScreenPrevious(); break;
            case 'ArrowRight': this.handleFullScreenNext(); break;
            case '+': case '=': this.handleFullScreenZoomIn(); break;
            case '-': case '_': this.handleFullScreenZoomOut(); break;
        }
    }
    handleFullScreenPrevious() {
        if (!this.isFullScreenPreviousDisabled) this.handlePreviousImage();
    }
    handleFullScreenNext() {
        if (!this.isFullScreenNextDisabled) this.handleNextImage();
    }
    handleFullScreenZoomIn() {
        this.fullScreenScale += FULL_SCREEN_ZOOM_STEP;
    }
    handleFullScreenZoomOut() {
        if (!this.isFullScreenZoomOutDisabled) {
            this.fullScreenScale = Math.max(MIN_FULL_SCREEN_SCALE, this.fullScreenScale - FULL_SCREEN_ZOOM_STEP);
        }
    }
    handleFullScreenRotate() {
        this.handleRotateImage();
    }
    resetImageSpecificState() {
        this.isCurrentFileLoading = false;
        this.isPanning = false;
        this.isHoverZoomActive = false;
        this.isZoomLocked = false;
        this.currentLockedAdjustedScale = DEFAULT_SCALE;
        this.currentRotationAngle = 0;
        this.fullScreenScale = MIN_FULL_SCREEN_SCALE;
    }
    initializeCurrentImageDisplay() {
        this.resetImageSpecificState();
        this.imageViewerElement = this.template.querySelector('.image-container');
        this.scrollWrapperElement = this.template.querySelector('.scroll-wrapper');
        if (this.isCurrentImageAnImage) {
            this.isCurrentFileLoading = true;
            const img = this.template.querySelector('img.zoomable-image');
            if (img) {
                img.onload = () => this.handleImageLoadSuccess();
                img.onerror = () => this.handleImageLoadError(this.currentImageName);
            }
        }
        this.applyImageTransforms();
    }
    centerAndResetScroll() {
        if (this.scrollWrapperElement) {
            const scrollableWidth = this.scrollWrapperElement.scrollWidth - this.scrollWrapperElement.clientWidth;
            const scrollableHeight = this.scrollWrapperElement.scrollHeight - this.scrollWrapperElement.clientHeight;
            this.scrollWrapperElement.scrollLeft = scrollableWidth / 2;
            this.scrollWrapperElement.scrollTop = scrollableHeight / 2;
        }
    }
    applyImageTransforms() {
        const img = this.imageElement;
        if (!img) return;
        let scale = DEFAULT_SCALE;
        let transformOriginX = this.baseTransformOriginX;
        let transformOriginY = this.baseTransformOriginY;
        if (this.isZoomLocked) {
            scale = this.currentLockedAdjustedScale;
            transformOriginX = this.lockedTransformOriginX;
            transformOriginY = this.lockedTransformOriginY;
        } else if (this.isHoverZoomActive) {
            scale = HOVER_ZOOM_SCALE;
            transformOriginX = this.hoverTransformOriginX;
            transformOriginY = this.hoverTransformOriginY;
        }
        img.style.transform = `scale(${scale}) rotate(${this.currentRotationAngle}deg)`;
        img.style.transformOrigin = `${transformOriginX} ${transformOriginY}`;
    }
    handlePreviousImage() {
        if (!this.isPreviousDisabled) {
            this.currentFileIndex--;
            this._lastRenderedFileIndex = -1;
        }
    }
    handleNextImage() {
        if (!this.isNextDisabled) {
            this.currentFileIndex++;
            this._lastRenderedFileIndex = -1;
        }
    }
    handleRotateImage() {
        this.currentRotationAngle = (this.currentRotationAngle + 90) % 360;
        this.applyImageTransforms();
    }
    handleImageMouseEnter(event) {
        if (!this.isZoomLocked) {
            this.isHoverZoomActive = true;
            this.updateHoverZoomPosition(event);
            this.applyImageTransforms();
        }
    }
    handleImageMouseMoveForHoverZoom(event) {
        if (this.isHoverZoomActive && !this.isZoomLocked) {
            this.updateHoverZoomPosition(event);
            this.applyImageTransforms();
        }
    }
    updateHoverZoomPosition(event) {
        const rect = event.target.getBoundingClientRect();
        this.hoverTransformOriginX = `${((event.clientX - rect.left) / rect.width) * 100}%`;
        this.hoverTransformOriginY = `${((event.clientY - rect.top) / rect.height) * 100}%`;
    }
    handleImageMouseLeave() {
        if (!this.isZoomLocked) {
            this.isHoverZoomActive = false;
            this.applyImageTransforms();
        }
    }
    handleImageClickToLock(event) {
        if (this.isZoomLocked) {
            this.unlockAndResetZoom();
        } else {
            this.isZoomLocked = true;
            this.isHoverZoomActive = false;
            this.lockedInitialScale = HOVER_ZOOM_SCALE;
            this.currentLockedAdjustedScale = this.lockedInitialScale;
            this.updateHoverZoomPosition(event);
            this.lockedTransformOriginX = this.hoverTransformOriginX;
            this.lockedTransformOriginY = this.hoverTransformOriginY;
            this.applyImageTransforms();
            this.updateCursorForPanning();
        }
    }
    unlockAndResetZoom() {
        this.isZoomLocked = false;
        this.currentLockedAdjustedScale = DEFAULT_SCALE;
        this.applyImageTransforms();
        this.updateCursorForPanning();
        this.centerAndResetScroll();
    }
    handleLockedZoomIn() {
        if (this.isZoomLocked) {
            this.currentLockedAdjustedScale += LOCKED_ZOOM_STEP;
            this.applyImageTransforms();
        }
    }
    handleLockedZoomOut() {
        if (this.isZoomLocked) {
            this.currentLockedAdjustedScale = Math.max(MIN_LOCKED_EFFECTIVE_SCALE, this.currentLockedAdjustedScale - LOCKED_ZOOM_STEP);
            this.applyImageTransforms();
        }
    }
    updateCursorForPanning() {
        if (this.scrollWrapperElement) {
            this.scrollWrapperElement.style.cursor = this.isZoomLocked ? 'grab' : 'default';
        }
        if (this.imageViewerElement) {
            this.imageViewerElement.style.cursor = this.isZoomLocked ? 'grab' : 'crosshair';
        }
    }
    handleViewerMouseDown(event) {
        if (this.isZoomLocked && this.scrollWrapperElement) {
            event.preventDefault();
            this.isPanning = true;
            this.panStartX = event.clientX;
            this.panStartY = event.clientY;
            this.scrollWrapperScrollLeftStart = this.scrollWrapperElement.scrollLeft;
            this.scrollWrapperScrollTopStart = this.scrollWrapperElement.scrollTop;
            this.scrollWrapperElement.style.cursor = 'grabbing';
            if (this.imageViewerElement) this.imageViewerElement.style.cursor = 'grabbing';
        }
    }
    handleViewerMouseMovePanning(event) {
        if (this.isPanning && this.scrollWrapperElement) {
            event.preventDefault();
            const dx = event.clientX - this.panStartX;
            const dy = event.clientY - this.panStartY;
            this.scrollWrapperElement.scrollLeft = this.scrollWrapperScrollLeftStart - dx;
            this.scrollWrapperElement.scrollTop = this.scrollWrapperScrollTopStart - dy;
        }
    }
    handleViewerMouseUpPanning() {
        if (this.isPanning) {
            this.isPanning = false;
            this.updateCursorForPanning();
        }
    }
    handleViewerMouseLeavePanning() {
        if (this.isPanning) {
            this.isPanning = false;
            this.updateCursorForPanning();
        }
    }

    handleTicketStatusChange(event){
        const status = event.detail.value;
        this.ticketForm_TicketStatus = status; 
        this.showTicketOutcomeField = (status === 'Ticket Closed');
        if (!this.showTicketOutcomeField) {
            this.ticketForm_Outcome = null; 
        }
    }

    handleTicketSubmit(event) {
        event.preventDefault(); 
        this.showNewTicketSpinner = true;
        this.ticketSaveErrorFeedback = '';

        const currentFields = event.detail.fields;

        if (currentFields[this.ticketFields.ticketStatus] === 'Ticket Closed' && !currentFields[this.ticketFields.outcome]) {
            this.showToast('Missing Information', 'Ticket Outcome is required when Status is "Ticket Closed".', 'error');
            this.showNewTicketSpinner = false;
            return;
        }

        if (currentFields[this.ticketFields.ticketStatus] !== 'Ticket Closed') {
            currentFields[this.ticketFields.outcome] = 'Pending';
        }

        currentFields[this.ticketFields.driverCoverageOpportunity] = this.ticketForm_OppId;
        currentFields[this.ticketFields.driverCoverageStatus] = this.flowDriverCoverage;
        currentFields[this.ticketFields.ticketType] = this.flowTypeTicket;
        currentFields[this.ticketFields.agent] = this.caseAgentId;
       
        try {
            this.template.querySelector('lightning-record-edit-form').submit(currentFields);
        } catch (e) {
            this.handleTicketSaveError(e); 
        }
    }

    async handleTicketSaveSuccess(event) {
        const newTicketId = event.detail.id;
        
        const logsToCreate = this.ocrDataFields.map(field => {
            return {
                fieldName: field.fieldName,
                extractedValue: field.extractedValue,
                isAccurate: field.isAccurate,
                reviewerNotes: field.reviewerNotes,
                expectedValue: field.currentValue,
                aiReason: field.aiReason
            };
        });

        let allOperationsSuccessful = true;

        if (logsToCreate.length > 0) {
            try {
                await saveExtractionLogsApex({
                    caseIdForLog: this.caseId,
                    ticketId: newTicketId,
                    neilonFileId: this.primaryNeilonFileId,
                    logsToSave: logsToCreate
                });
            } catch (logError) {
                allOperationsSuccessful = false;
                this.showToast('Error', 'Failed to save extraction logs: ' + this.getFriendlyErrorMessage(logError), 'error');
            }
        }
        
        if (allOperationsSuccessful) { 
            this.showToast('Success', 'Ticket created successfully.', 'success');
            this.dispatchEvent(new CustomEvent('ticketsaved', { detail: { ticketId: newTicketId, createComplianceChallenge: this.createComplianceChallengeRecord } }));
            this.handleClose();
        }

        this.showNewTicketSpinner = false;
    }

    handleComplianceCheckboxChange() {
        this.createComplianceChallengeRecord = true;
    }

    handleTicketSaveError(error) {
        let errorMessage = 'Unknown error during ticket save.';
        if (error && error.detail) { 
            if (error.detail.message) { errorMessage = error.detail.message; }
            else if (error.detail.detail) { errorMessage = error.detail.detail; }
            else if (typeof error.detail === 'string') { errorMessage = error.detail; }
            if (error.detail.output && error.detail.output.errors && error.detail.output.errors.length > 0) {
                errorMessage = error.detail.output.errors.map(e => e.message).join(', ');
            }
        } else if (error && error.body && error.body.message) { 
            errorMessage = error.body.message;
        } else if (error && error.message) { 
             errorMessage = error.message;
        } else if (typeof error === 'string') { 
            errorMessage = error;
        }
        this.ticketSaveErrorFeedback = `Error creating ticket: ${errorMessage}`;
        this.showToast('Error Creating Ticket', errorMessage, 'error');
        this.showNewTicketSpinner = false;
    }
}
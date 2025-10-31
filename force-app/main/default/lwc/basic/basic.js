import { LightningElement, wire, api, track } from 'lwc';
import getFilesList from '@salesforce/apex/FilesOnCases.getFilesList';
import noAttachments from '@salesforce/label/c.No_attachments_on_Case';
import addAttachmentToTicket from '@salesforce/apex/FilesOnCases.addAttachmentsToTicket';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

const columns = [
    { label: 'Title', fieldName: 'Title', sortable: true, editable: true },
    { label: 'File Type', fieldName: 'type', sortable: true, editable: true }
];

export default class Basic extends LightningElement {
    @api caseRecordId;
    @api targetRecordId;
    @api preselectAllFiles = false;

    @track selectedRowIds = []; 
    @track data = [];
    @track error;
    
    columns = columns;
    isModalOpen = false;
    isNoFiles = false;
    label = noAttachments;
    @track isLoading = true;

    // A static property belongs to the CLASS, not the instance.
    // Its value will persist even when the component is destroyed and recreated.
    static cacheBuster = 0;

    // An instance property to hold the current cacheBuster value for the wire.
    @track cacheBuster = Basic.cacheBuster;
    
    get headerName() {
        return this.preselectAllFiles ? 'Ticket' : 'Compliance Challenge';
    }

    connectedCallback() {
        this.isModalOpen = true;
        // Ensure this instance gets the latest static value when it's created
        this.cacheBuster = Basic.cacheBuster;
    }
    
    closeModal() {
        this.isModalOpen = false;
        this.dispatchEvent(new CustomEvent('cancel'));
    }

    handleCancel() {
        this.processSaveAndTransfer([], 'Changes saved');
    }

    uploadContract() {
        this.processSaveAndTransfer(this.selectedRowIds, 'Data saved successfully');
    }
    
    // The wire now correctly includes the cacheBuster parameter, which must also exist on the Apex method.
    @wire(getFilesList, { recordId: '$caseRecordId', cacheBuster: '$cacheBuster' })  
    wiredFiles({ error, data }) {  
        if (data) {  
            const { contentDocuments, neilonFiles } = data;  
            this.isNoFiles = (!contentDocuments || contentDocuments.length === 0) && (!neilonFiles || neilonFiles.length === 0);
            
            if (this.isNoFiles) {
                this.data = [];
            } else {
                let options = [];
                if (contentDocuments?.length > 0) {  
                    options.push(...contentDocuments.map(doc => ({
                        Id: doc.Id,  
                        Title: doc.Title,  
                        type: doc.FileExtension,  
                        ContentSize: doc.ContentSize,
                        isContentDoc: true  
                    })));
                }  
                if (neilonFiles?.length > 0) {  
                    options.push(...neilonFiles.map(file => ({
                        Id: file.Id,  
                        Title: file.Name,  
                        type: file.File_Type__c,  
                        ContentSize: file.NEILON__Size__c,
                        isContentDoc: false  
                    })));
                }  
                this.data = options;
                
                if (this.preselectAllFiles && this.data.length > 0) {
                    this.selectedRowIds = this.data.map(item => item.Id);
                }
            }
            this.error = undefined;
        } else if (error) {  
            this.error = error;
            this.data = [];
        }  
        this.isLoading = false; 
    }

    async processSaveAndTransfer(selectedFileIds, baseSuccessMessage) {
        const datatable = this.template.querySelector('[data-id="datatable"]');
        const currentDraftValues = datatable ? datatable.draftValues : [];

        if (currentDraftValues.length === 0 && selectedFileIds.length === 0) {
            this.dispatchEvent(new CustomEvent('filesattached', { detail: { targetId: this.targetRecordId } }));
            this.isModalOpen = false;
            return;
        }

        this.isLoading = true;

        const selectedIdsSet = new Set(selectedFileIds);
        const fullSelectedRows = this.data.filter(row => selectedIdsSet.has(row.Id));

        const contentDocIds = fullSelectedRows.filter(r => r.isContentDoc).map(r => r.Id);
        const neilonFileIds = fullSelectedRows.filter(r => !r.isContentDoc).map(r => r.Id);

        try {
            await addAttachmentToTicket({ 
                recordId: this.targetRecordId, 
                contentDocIds, 
                neilonFileIds, 
                draftValues: currentDraftValues 
            });
            
            // Increment the STATIC cacheBuster value.
            // The next time an instance of this component is created, it will
            // pick up this new, incremented value, forcing the wire to refresh.
            Basic.cacheBuster++;

            // Provide a more specific success message
            let successMessage = baseSuccessMessage;
            const draftsSaved = currentDraftValues.length > 0;
            const filesTransferred = selectedFileIds.length > 0;
            if (draftsSaved && !filesTransferred) successMessage = 'Changes saved successfully.';
            if (!draftsSaved && filesTransferred) successMessage = 'Files transferred successfully.';
            if (draftsSaved && filesTransferred) successMessage = 'Files transferred and changes saved successfully.';
            this.showToast('Success', successMessage, 'success');

            this.dispatchEvent(new CustomEvent('filesattached', {
                detail: { targetId: this.targetRecordId }
            }));
            this.isModalOpen = false;

        } catch(error) {
            const errorMessage = error?.body?.message || 'An unknown error occurred.';
            this.showToast('Error', `Error saving data: ${errorMessage}`, 'error');
        } finally {
            this.isLoading = false;
        }
    }

    getSelectedName(event) {
        this.selectedRowIds = event.detail.selectedRows.map(row => row.Id);
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
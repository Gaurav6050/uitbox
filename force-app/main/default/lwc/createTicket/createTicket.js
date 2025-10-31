import { LightningElement, api, wire, track } from "lwc";
import { refreshApex } from "@salesforce/apex";
import { getRecord, getFieldValue, updateRecord } from "lightning/uiRecordApi";
import { getObjectInfo } from "lightning/uiObjectInfoApi";
import { NavigationMixin } from "lightning/navigation";
import invokeAutoLaunchFlow from '@salesforce/apex/FlowLauncher.invokeAutoLaunchFlow';
import userId from '@salesforce/user/Id';

// All imports remain the same

// ... imports ...
import ACCOUNT_OBJECT from "@salesforce/schema/Account";
import ACCOUNT_CARRIER from "@salesforce/schema/Account.Carrier__c";
import STATUS from "@salesforce/schema/Case.Status";
import CASE_DRIVER from "@salesforce/schema/Case.Driver__c";
import CASE_CLOSED_REASON from "@salesforce/schema/Case.Case_Closed_Reason__c";
import CASE_ACCOUNT from "@salesforce/schema/Case.AccountId";
import TICKET from "@salesforce/schema/Case.Ticket__c";
import MEMBERSHIP_STATUS from "@salesforce/schema/Case.Membership_Status__c";
import SPECIAL_INSTRUCTIONS from "@salesforce/schema/Case.Special_Instructions_for_Ticket__c";
import CASE_DESCRIPTION from "@salesforce/schema/Case.Description";

import TICKET_NUMBER from "@salesforce/schema/Ticket__c.Name";
import TICKET_STATUS from "@salesforce/schema/Ticket__c.Attorney_Status__c";
import VIOLATION_DESCRIPTION from "@salesforce/schema/Ticket__c.Violation_Description__c";
import VIOLATION_CATEGORY from "@salesforce/schema/Ticket__c.Violation_Category__c";
import TICKET_TYPE from "@salesforce/schema/Ticket__c.TicketType__c";
import OUT_OF_SCOPE from "@salesforce/schema/Ticket__c.Out_of_Scope__c";
import ACCIDENT from "@salesforce/schema/Ticket__c.Accident__c";
import DRIVER_LICENSE_TYPE from "@salesforce/schema/Ticket__c.Drivers_License_Type__c";
import DATE_OF_TICKET from "@salesforce/schema/Ticket__c.Date_of_Ticket__c";
import COURT_DATE from "@salesforce/schema/Ticket__c.Court_Date__c";
import TICKET_COURT from "@salesforce/schema/Ticket__c.Ticket_Court__c";
import COURT_FIELD from "@salesforce/schema/Ticket__c.Court__c";
import COURT_PHONE_NUMBER from "@salesforce/schema/Ticket__c.Court_Phone_Number__c";
import TICKET_CITY from "@salesforce/schema/Ticket__c.Ticket_City__c";
import TICKET_COUNTRY from "@salesforce/schema/Ticket__c.Ticket_County__c";
import TICKET_STATE from "@salesforce/schema/Ticket__c.Ticket_State__c";
import CITATION_NUMBER from "@salesforce/schema/Ticket__c.Citation_Number__c";
import DATE_ENTERED from "@salesforce/schema/Ticket__c.Date_Entered__c";
import DRIVER from "@salesforce/schema/Ticket__c.Driver__c";
import Driver_Coverage_Opportunity from "@salesforce/schema/Ticket__c.Driver_Coverage_Opportunity__c";
import Driver_Coverage_Status from "@salesforce/schema/Ticket__c.Driver_Coverage_Status__c";
import TICKETTYPE from "@salesforce/schema/Ticket__c.TicketType__c";
import OWNER from "@salesforce/schema/Ticket__c.OwnerId";
import SPECIAL_COMMENTS from "@salesforce/schema/Ticket__c.Special_Instructions__c";
import TICKET_OUTCOME from "@salesforce/schema/Ticket__c.Ticket_Outcome__c";
import DEVELOPER_NOTES from "@salesforce/schema/Ticket__c.Developer_Notes__c";

const fields = [
  STATUS,
  CASE_DRIVER,
  CASE_CLOSED_REASON,
  TICKET,
  MEMBERSHIP_STATUS,
  SPECIAL_INSTRUCTIONS,
  CASE_ACCOUNT,
  CASE_DESCRIPTION
];


export default class createTicket extends NavigationMixin(LightningElement) {
    // ... all properties remain the same ...
    @api recordId;
    carrierId;
    currentRecordId;
    currentStatus;
    caseDriver;
    caseAccountId;
    ticket;
    membershipStatus;
    specialInstructions;
    ticketTypeValue;
    newRecordId;
    recordIdTicket;
    spinnerStatus = false;
    showTicketExists = false;
    showCreateTicket = false;
    isModalOpen = false;
    isFlowOpen= false;
    Screen1= false;
    showOutcome = false;
    showCompliance = false;
    driverCaseValue;
    error = "";
    ticketOutcomeValue;

    OppId;
    driverCoverage;
    TicketType;

    @track showChildComponent = false;
    @track createComplianceChallenge = false;
    @track targetRecordForFiles;
    @track preSelectFiles = false;
    @track newComplianceId;
    @track ticketIdForNewCompliance;

    // ... field schema imports ...
    ticketNumber = TICKET_NUMBER;
    ticketStatus = TICKET_STATUS;
    tickettype = TICKETTYPE;
    violationDescription = VIOLATION_DESCRIPTION;
    violationCategory = VIOLATION_CATEGORY;
    ticketType = TICKET_TYPE;
    outofscope = OUT_OF_SCOPE;
    accident = ACCIDENT;
    driverLicenseType = DRIVER_LICENSE_TYPE;
    dateOfTicket = DATE_OF_TICKET;
    courtDate = COURT_DATE;
    ticketCourt = TICKET_COURT;
    court = COURT_FIELD;
    courtPhoneNumber = COURT_PHONE_NUMBER;
    ticketCity = TICKET_CITY;
    ticketCountry = TICKET_COUNTRY;
    ticketState = TICKET_STATE;
    citationNumber = CITATION_NUMBER;
    dateEntered = DATE_ENTERED;
    developerNotes = DEVELOPER_NOTES;
    DriverCoverageStatus= Driver_Coverage_Status;
    DriverCoverageOpportunity= Driver_Coverage_Opportunity;
    driver = DRIVER;
    owner = OWNER;
    comments = SPECIAL_COMMENTS;
    outcome = TICKET_OUTCOME;
    personAccountRecordTypeId;


    // ... the rest of the file is identical to the previous correct version ...
    @track isAITicketModalOpen = false;
    @track selectedFileId;  
    @track selectedCaseId;

    get displayToMasterUser() {
        return userId === '005f2000009HwLxAAK'
    }


    openAITicketModal(event) {
        this.selectedFileId = event.target.dataset.fileid; 
        this.selectedCaseId = this.recordId; 
        setTimeout(() => {
        this.isAITicketModalOpen = true; 
        }, 1000);
    }
    closeAITicketModal() {
        this.isAITicketModalOpen = false; 
    }
    handleAITicketModalClose() {
        this.isAITicketModalOpen = false;
    }
    connectedCallback() {
        this.currentRecordId = this.recordId;
    }

    @wire(getRecord, { recordId: "$recordId", fields })
    case({ data, error }) {
        if (data) {
        this.currentStatus = getFieldValue(data, STATUS);
        if (getFieldValue(data, CASE_DRIVER) != null) {
            this.caseAccountId = getFieldValue(data, CASE_DRIVER);
        } else if (getFieldValue(data, CASE_ACCOUNT) != null) {
            this.caseAccountId = getFieldValue(data, CASE_ACCOUNT);
        }
        this.caseClosedReason = getFieldValue(data, CASE_CLOSED_REASON);
        const specialInstructions = getFieldValue(data, SPECIAL_INSTRUCTIONS);
        const caseDescription = getFieldValue(data, CASE_DESCRIPTION);
        this.specialInstructions = specialInstructions !== null && caseDescription !== null 
                                ? specialInstructions + '\n' + caseDescription : specialInstructions || caseDescription; 
        this.ticket = getFieldValue(data, TICKET);
        this.membershipStatus = getFieldValue(data, MEMBERSHIP_STATUS);
        this.ticketTypeValue = "Membership";
        }
    }

    @wire(getRecord, { recordId: "$caseAccountId", fields: [ACCOUNT_CARRIER] })
    getDriver({ data, error }) {
        if (data) {
        if (data.recordTypeInfo.name === "Person Account") {
            this.caseDriver = this.caseAccountId;
            this.carrierId = getFieldValue(data, ACCOUNT_CARRIER);
        }
        }
    }

    @wire(getObjectInfo, { objectApiName: ACCOUNT_OBJECT })
    Function({ error, data }) {
        if (data) {
        let objArray = data.recordTypeInfos;
        for (let i in objArray) {
            if (objArray[i].name === "Person Account")
            this.personAccountRecordTypeId = objArray[i].recordTypeId;
        }
        }
    }

    handleDriverChange(event) {
        this.driver = event.target.value || (JSON.stringify(this.caseDriver));
    }

    handleDateOfTicketChange(event) {
        this.dateOfTicket = event.target.value;
    }

    handleStatusChange(event) {
        this.spinnerStatus = true;

        if ((!this.caseDriver || !this.driver) && !this.dateOfTicket ) {
            this.spinnerStatus = false;
            return;
        }
        let driverValue = (this.caseDriver) || this.driver;
        invokeAutoLaunchFlow({ 
            Driver:driverValue, 
            DateOfTicket: this.dateOfTicket 
        })
        .then(result => {
            this.OppId = result.OppId;
            this.driverCoverage = result.DriverCoverage;
            this.TicketType = result.TypeTicket;
            this.openModal();
        })
        .catch(error => {
            console.error('Error:', JSON.stringify(error));
        })
        .finally(() => {
            this.spinnerStatus = false;
        });
    }

    handleSubmit(event) {
        this.spinnerStatus = true;
    }

    handleSuccess(event) {
        this.spinnerStatus = false;
        this.recordIdTicket = event.detail.id;
        this.ticketIdForNewCompliance = this.recordIdTicket;
        this.isModalOpen = false;

        this.targetRecordForFiles = this.recordIdTicket;
        this.preSelectFiles = true; 
        this.showChildComponent = true;

        let fields = {
        Id: this.currentRecordId,
        Status: "Closed",
        Case_Closed_Reason__c: "Ticket Created",
        Ticket__c: event.detail.id,
        Driver__c:
            this.driverCaseValue && this.driverCaseValue.length > 0
            ? this.driverCaseValue[0]
            : null
        };
        const recordInput = { fields };
        updateRecord(recordInput)
        .then(() => {
            refreshApex(this.case);
        })
        .catch((error) => {
            console.error("Error updating record: ", JSON.stringify(error));
            this.error = "Error updating record: " + error.body.message;
        });
    }

    handleFilesAttached(event) {
        this.showChildComponent = false;
        
        if (this.createComplianceChallenge && event.detail.targetId === this.recordIdTicket) {
            this.preSelectFiles = false;
            this.showCompliance = true;
        } 
        else if (this.createComplianceChallenge && event.detail.targetId === this.newComplianceId) {
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: {
                    recordId: this.newComplianceId,
                    objectApiName: 'Inspection__c',
                    actionName: 'view'
                }
            });
        } else if (event.detail.targetId === this.newComplianceId) {
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: {
                    recordId: this.newComplianceId,
                    objectApiName: 'Inspection__c',
                    actionName: 'view'
                }
            });
        } else {
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: {
                    recordId: this.recordIdTicket,
                    objectApiName: 'Ticket__c',
                    actionName: 'view'
                }
            });
        }
    }

    handleBasicCancel() {
        this.showChildComponent = false;

        if (this.createComplianceChallenge) {
            this.preSelectFiles = false;
            this.showCompliance = true;
            this.createComplianceChallenge = false;
            return;
        }

        if(this.recordIdTicket || this.newComplianceId) {
            const localRecordIdTicket = this.recordIdTicket;
            const localNewComplianceId = this.newComplianceId;
            this.recordIdTicket = null;
            this.newComplianceId = null;
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: {
                    recordId: this.preSelectFiles ? localRecordIdTicket : localNewComplianceId,
                    objectApiName: this.preSelectFiles ? 'Ticket__c' : 'Inspection__c',
                    actionName: 'view'
                }
            });
        }
    }

    handleError(error) {
        this.spinnerStatus = false;
        console.error("Error updating record: ", JSON.stringify(error));
        if (error && error.detail) {
        const errorMessage = error.detail.detail || "Unknown error";
        if (errorMessage.includes("duplicate value found")) {
            const recordIdMatch = errorMessage.match(/record with id: (\w+)/);
            if (recordIdMatch) {
            const recordId = recordIdMatch[1];
            const recordUrl = `/lightning/r/Ticket__c/${recordId}/view`;
            this.error = "The Citation Number is Duplicate.";
            this.recordUrl = recordUrl;
            } else {
            this.error = "Duplicate value error but record ID not found.";
            this.recordUrl = null;
            }
        } else {
            this.error = errorMessage;
            this.recordUrl = null;
        }
        setTimeout(() => {
            this.error = "";
            this.recordUrl = null;
        }, 10000);
        } else {
        this.error = "Unknown error";
        this.recordUrl = null;
        }
    }

    closeAITicketModal() {
        this.isAITicketModalOpen = false;
    }

    handleChange(event) {
        if (event.currentTarget.fieldName === this.driver.fieldApiName) {
        this.driverCaseValue = event.detail.value;
        }
        if (event.currentTarget.fieldName === this.ticketStatus.fieldApiName) {
        this.showOutcome = event.currentTarget.value === "Ticket Closed";
        }
        if (event.currentTarget.fieldName === this.outofscope.fieldApiName) {
        this.ticketTypeValue =
            event.currentTarget.value === true ? "Out Of Scope" : "Membership";
        }
    }
    
    handleComplianceCheckboxChange(event) {
        this.createComplianceChallenge = event.target.checked;
    }

    handleComplianceSuccess(event) {
        this.newComplianceId = event.detail.id;
        this.showCompliance = false;
        this.ticketIdForNewCompliance = null;
        this.targetRecordForFiles = this.newComplianceId;
        this.preSelectFiles = false;
        this.showChildComponent = true;
    }

    handleComplianceCancel() {
        this.showCompliance = false;
        if (this.createComplianceChallenge && this.recordIdTicket) {
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: {
                    recordId: this.recordIdTicket,
                    objectApiName: 'Ticket__c',
                    actionName: 'view'
                }
            });
        }
    }

    handleAiTicketSave(event) {
        const ticketId = event.detail.ticketId;
        const createComplianceChallenge = event.detail.createComplianceChallenge;
        this.targetRecordForFiles = ticketId;
        this.recordIdTicket = ticketId;
        this.ticketIdForNewCompliance = ticketId;
        this.createComplianceChallenge = createComplianceChallenge;
        this.preSelectFiles = true;
        this.showChildComponent = true;
    }

    openScreen1() {
        this.Screen1= true;
        this.isModalOpen = false;
    }

    openModal() {
        this.Screen1=false;
        this.isModalOpen = true;
        this.showCreateTicket = false;
        if (this.ticket) {
        this.showTicketExists = true;
        } else {
        this.showCreateTicket = true;
        }
    }

    openCompliance() {
        this.showCompliance = !this.showCompliance;
        this.ticketIdForNewCompliance = this.ticket;
    }

    closeModal() {
        this.isModalOpen = false;
        this.showOutcome = false;
    }

    handleCloseModal() {
        this.Screen1 = false;
    }
    
    openCreateTicket() {
        this.showTicketExists = false;
        this.showCreateTicket = true;
    }
}
public with sharing class AiTicketModalController {
    
        @AuraEnabled(cacheable=true)
    public static Id getNeilonFileIdByCase(Id caseId) {
        System.debug('caseId => ' + caseid);
        try {
            NEILON__File__c neilonFile = [
                SELECT Id, Name, NEILON__Image_Preview__c, OCR_Response__c, Ticket__c, NEILON__Case__c
                FROM NEILON__File__c
                WHERE NEILON__Case__c = :caseId
                LIMIT 1
            ];
            return neilonFile.Id;
        } catch (QueryException e) {
            // Handle case where no NEILON__File__c is found
            System.debug('No NEILON__File__c found for Case Id: ' + caseId);
            return null;
        }
    }
    
      @AuraEnabled
    public static void updateTicketRecordagain(Map<String, Object> fieldMap) {
        if (fieldMap == null || !fieldMap.containsKey('Id')) {
            throw new AuraHandledException('Record Id is required to update Ticket.');
        }

        Ticket__c ticket = new Ticket__c();

        for (String key : fieldMap.keySet()) {
            ticket.put(key, fieldMap.get(key));
        }

        update ticket;
    }

    // Get the file data (OCR and field descriptions) based on fileId
    @AuraEnabled(cacheable=true)
    public static FileDataWrapper getFileData(String fileId) {
        NEILON__File__c neilonFile = [SELECT Id, Name, NEILON__Image_Preview__c, OCR_Response__c, Ticket__c, NEILON__Case__c FROM NEILON__File__c WHERE Id = :fileId];
        Map<String, FieldDescribe> fieldDescribes = getFieldDescribes('Ticket__c');
        Map<String, String> fieldLabels = getFieldLabels('Ticket__c');
        return new FileDataWrapper(neilonFile, fieldDescribes, fieldLabels);
    }

    // Save the extracted data and ticket
    @AuraEnabled
    public static Id saveExtractionLogAndTicket(String fileId, List<ExtractionLogData> extractionLogData, Map<String, String> ocrData) {
        Id ticketId = updateTicketRecord(fileId, extractionLogData, ocrData);
        
        if(ticketId != null)
            saveExtractionData(fileId, ticketId, extractionLogData);

        return ticketId;
    }

    // Update or insert the ticket record based on OCR data
    @AuraEnabled
    public static Id updateTicketRecord(String fileId, List<ExtractionLogData> extractionLogData, Map<String, String> ocrData) {
        try {
            Id fileIdLocal = Id.valueOf(fileId);
            String queryString = ' SELECT Id, Name, NEILON__Title1__c, File_Type__c, OCR_Response__c, Ticket__c, NEILON__Case__r.AccountId, NEILON__Case__r.Account.IsPersonAccount, NEILON__Case__r.Account.Carrier__c, NEILON__Case__r.Driver__c, NEILON__Case__r.Contact.AccountId FROM NEILON__File__c WHERE Id = :fileIdLocal AND File_Type__c != null LIMIT 1 ';
            
            NEILON__File__c s3File = Database.query(queryString);

            Ticket__c ticketRecord = s3File.Ticket__c != null ? ([SELECT Id, Name FROM Ticket__c WHERE Id =: s3File.Ticket__c LIMIT 1]) : null;

            if (ticketRecord == null) {
                Ticket__c ticketToInsert = new Ticket__c();
                
                for (String key : ocrData.keySet()) {
                    if (key == 'Date_of_Ticket__c' || key == 'Court_Date__c') {
                        if (String.isNotBlank((String) ocrData.get(key))) {
                            String[] dateParts = ((String) ocrData.get(key)).split('/');
                            Date dateValue = Date.valueOf(dateParts[2] + '-' + dateParts[0] + '-' + dateParts[1]);
                            ticketToInsert.put(key, dateValue);
                        }
                    } else {
                        ticketToInsert.put(key, (String) ocrData.get(key));
                    }

                    // Setting Carrier and Driver based on Person Account logic
                    if (s3File?.NEILON__Case__r?.Account?.IsPersonAccount) {  
                        ticketToInsert.Carrier__c = s3File?.NEILON__Case__r?.Account?.Carrier__c;
                        ticketToInsert.Driver__c = s3File?.NEILON__Case__r?.AccountId;
                    } else {
                        ticketToInsert.Carrier__c = s3File?.NEILON__Case__r?.AccountId;
                        ticketToInsert.Driver__c = s3File?.NEILON__Case__r?.Driver__c != null ? s3File?.NEILON__Case__r?.Driver__c : s3File?.NEILON__Case__r?.Contact.AccountId; 
                    } 
                }
                insert ticketToInsert;

                ticketRecord = [SELECT Id, Name FROM Ticket__c WHERE Id =: ticketToInsert.Id];

                NEILON__File__c updateFileRecord = new NEILON__File__c();
                updateFileRecord.Id = fileIdLocal;
                updateFileRecord.Ticket__c = ticketRecord.Id;
                update updateFileRecord;
            }

            return ticketRecord.Id;
        } catch (Exception e) {
            System.debug('Error in insertTicketRecord: ' + e.getMessage() );
            System.debug('Error in insertTicketRecord: ' + e.getStackTraceString());
            throw new AuraHandledException(e.getMessage());
        }
    }

    // Save the extracted data to `Extraction_Log__c`
    private static String saveExtractionData(String fileId, String ticketId, List<ExtractionLogData> extractionLogData) {
        try {
            List<Extraction_Log__c> extractionLogsToInsert = new List<Extraction_Log__c>();

            NEILON__File__c file = [SELECT NEILON__Case__c FROM NEILON__File__c WHERE Id = :fileId];

            for (ExtractionLogData logData : extractionLogData) {
                Extraction_Log__c log = new Extraction_Log__c();
                log.Case__c = file.NEILON__Case__c;
                log.Ticket__c = ticketId;
                log.Field_Name__c = logData.fieldName;
                log.Extracted_Value__c = logData.extractedValue;
                log.Expected_Value__c = logData.expectedValue;
                log.Is_Accurate__c = logData.isAccurate;
                log.Reviewer_Notes__c = logData.reviewerNotes;
                extractionLogsToInsert.add(log);
            }
            insert extractionLogsToInsert;
            return 'success';
        } catch (Exception e) {
            System.debug('Error saving extraction data: ' + e.getMessage());
            throw new AuraHandledException(e.getMessage());
        }
    }

    // Get field labels for the Ticket object
    @AuraEnabled(cacheable=true)
    public static Map<String, String> getFieldLabels(String objectName) {
        Map<String, String> fieldLabels = new Map<String, String>();
        try {
            DescribeSObjectResult describeResult = Schema.getGlobalDescribe().get(objectName).getDescribe();
            Map<String, SObjectField> fieldMap = describeResult.fields.getMap();
            if (fieldMap != null && !fieldMap.isEmpty()) {
                for (String fieldName : fieldMap.keySet()) {
                    fieldLabels.put(fieldName.toLowerCase(), fieldMap.get(fieldName).getDescribe().getLabel());
                }
            }
            return fieldLabels;
        } catch (Exception e) {
            System.debug('Error Retrieving the value => ' + e.getMessage());
            throw new AuraHandledException(e.getMessage());
        }
    }

    // Get field descriptions for the Ticket object
    @AuraEnabled(cacheable=true)
    public static Map<String, FieldDescribe> getFieldDescribes(String objectName) {
        Map<String, FieldDescribe> fieldDescribes = new Map<String, FieldDescribe>();
        try {
            DescribeSObjectResult describeResult = Schema.getGlobalDescribe().get(objectName).getDescribe();
            Map<String, SObjectField> fieldMap = describeResult.fields.getMap();
            if (fieldMap != null && !fieldMap.isEmpty()) {
                for (String fieldName : fieldMap.keySet()) {
                    DescribeFieldResult fieldDescribe = fieldMap.get(fieldName).getDescribe();
                    fieldDescribes.put(fieldName, new FieldDescribe(fieldName, fieldDescribe.getType().name()));
                }
            }
            return fieldDescribes;
        } catch (Exception e) {
            System.debug('Error Retrieving the value => ' + e.getMessage());
            throw new AuraHandledException(e.getMessage());
        }
    }

    // Helper Classes
    public class ExtractionLogData {
        @AuraEnabled public String fieldName { get; set; }
        @AuraEnabled public String extractedValue { get; set; }
        @AuraEnabled public Boolean isAccurate { get; set; }
        @AuraEnabled public String reviewerNotes { get; set; }
        @AuraEnabled public String expectedValue { get; set; }
    }

    public class FileDataWrapper {
        @AuraEnabled public NEILON__File__c file;
        @AuraEnabled public Map<String, String> fieldLabels;
        @AuraEnabled public Map<String, FieldDescribe> fieldDescribes;

        public FileDataWrapper(NEILON__File__c file, Map<String, FieldDescribe> fieldDescribes, Map<String, String> fieldLabels) {
            this.file = file;
            this.fieldDescribes = fieldDescribes;
            this.fieldLabels = fieldLabels;
        }
    }

    public class FieldDescribe {
        @AuraEnabled public String fieldName;
        @AuraEnabled public String fieldType;

        public FieldDescribe(String fieldName, String fieldType) {
            this.fieldName = fieldName;
            this.fieldType = fieldType;
        }
    }
}
import {Application} from "../../../support/application.config";
import {tiles, toolbar} from "../../../support/components/common";
import loadPage from "../../../support/pages/load";
import runPage from "../../../support/pages/run";
import browsePage from "../../../support/pages/browse";
import LoginPage from "../../../support/pages/login";

describe("Default ingestion ", () => {

  beforeEach(() => {
    cy.visit("/");
    cy.contains(Application.title);
    cy.loginAsTestUserWithRoles("hub-central-load-writer", "hub-central-flow-writer").withRequest();
    LoginPage.postLogin();
    cy.waitUntil(() => toolbar.getLoadToolbarIcon()).click();
    cy.waitUntil(() => loadPage.stepName("ingestion-step").should("be.visible"));
  });

  afterEach(() => {
    cy.resetTestUser();
  });

  after(() => {
    cy.loginAsDeveloper().withRequest();
    cy.deleteSteps("ingestion", "cyZIPTest", "cyCSVTest", "cyXMTest");//'cyCSVTest', 'cyXMTest',
    cy.deleteFlows("zipE2eFlow", "csvE2eFlow", "xmlE2eFlow");//'csvE2eFlow', 'xmlE2eFlow',
  });

  it("Verifies CRUD functionality from list view", () => {
    let stepName = "cyListView";
    let flowName = "newE2eFlow";
    //Verify Cancel
    loadPage.loadView("table").click();
    loadPage.addNewButton("list").click();
    loadPage.stepNameInput().type(stepName);
    loadPage.stepDescriptionInput().type("cyTestDesc");
    loadPage.selectSourceFormat("XML");
    loadPage.selectTargetFormat("XML");
    loadPage.uriPrefixInput().type("/e2eLoad/");
    loadPage.cancelButton().click();
    cy.findByText("Discard changes?").should("be.visible");
    loadPage.confirmationOptions("No").click();
    loadPage.cancelButton().click({force: true});
    loadPage.confirmationOptions("Yes").click();
    cy.findByText(stepName).should("not.be.visible");

    //Verify Save
    loadPage.addNewButton("list").click();
    loadPage.stepNameInput().type(stepName);
    loadPage.stepDescriptionInput().type("cyTestDesc");
    loadPage.selectSourceFormat("XML");
    loadPage.selectTargetFormat("XML");
    loadPage.uriPrefixInput().type("/e2eLoad/");
    loadPage.saveButton().click();
    cy.findByText(stepName).should("be.visible");

    //Verify Edit
    loadPage.stepName(stepName).click();
    loadPage.stepNameInput().should("be.disabled");
    loadPage.stepDescriptionInput().clear().type("UPDATE");
    loadPage.saveButton().click();
    cy.waitForAsyncRequest();
    cy.findByText("UPDATE").should("be.visible");

    //Verify Advanced Settings
    loadPage.stepName(stepName).click();
    loadPage.switchEditAdvanced().click();  // Advanced tab
    loadPage.selectTargetDB("FINAL");
    loadPage.targetCollectionInput().type("e2eTestCollection{enter}test1{enter}test2{enter}");
    cy.findByText("Default Collections").click();
    loadPage.defaultCollections(stepName).should("be.visible");
    loadPage.appendTargetPermissions("data-hub-common,update");
    loadPage.selectProvGranularity("Off");
    loadPage.setBatchSize("200");
    //Verify JSON error
    cy.get("#headers").clear().type("{").tab();
    loadPage.jsonValidateError().should("be.visible");
    cy.findByTestId(`${stepName}-save-settings`).should("be.disabled"); // Errors disable save button
    loadPage.setHeaderContent("loadTile/headerContent");
    //Verify JSON error
    cy.findByText("Interceptors").click();
    cy.get("#interceptors").clear().type("[\"test\": \"fail\"]").tab();
    loadPage.jsonValidateError().should("be.visible");
    cy.findByText("Interceptors").click(); //closing the interceptor text area
    loadPage.setStepInterceptor("loadTile/stepInterceptor");
    //Verify JSON error
    cy.findByText("Custom Hook").click();
    cy.get("#customHook").clear().type("{test}", {parseSpecialCharSequences: false}).tab();
    loadPage.jsonValidateError().should("be.visible");
    cy.findByText("Custom Hook").click(); //closing the custom hook text area
    loadPage.setCustomHook("loadTile/customHook");
    loadPage.cancelSettings(stepName).click();
    loadPage.confirmationOptions("No").click();
    loadPage.saveSettings(stepName).click();
    cy.waitForAsyncRequest();
    loadPage.stepName(stepName).should("be.visible");

    // Open settings, change setting, switch tabs, save
    loadPage.stepName(stepName).click();
    loadPage.stepDescriptionInput().clear().type("UPDATE2");
    loadPage.switchEditAdvanced().click();
    loadPage.saveSettings(stepName).click();
    cy.waitForAsyncRequest();

    // Verify that change was saved
    loadPage.stepName(stepName).click();
    loadPage.stepDescription("UPDATE2").should("be.visible");
    loadPage.cancelButton().click();

    // Open settings, change setting, switch tabs, cancel, discard changes
    loadPage.stepName(stepName).click();
    loadPage.stepDescriptionInput().clear().type("DISCARD");
    loadPage.switchEditAdvanced().click();
    cy.findByTestId(`${stepName}-cancel-settings`).click();
    cy.findByText("Discard changes?").should("be.visible");
    loadPage.confirmationOptions("Yes").click();

    // Verify that change was NOT saved.
    loadPage.stepName(stepName).click();
    loadPage.stepDescription("UPDATE2").should("be.visible");
    loadPage.stepDescription("DISCARD").should("not.be.visible");
    loadPage.cancelButton().click();

    //Cancel Add to New Flow
    loadPage.addStepToNewFlowListView(stepName);
    cy.findByText("New Flow").should("be.visible");
    loadPage.confirmationOptions("Cancel").click();
    //should route user back to load page list view
    cy.waitUntil(() => loadPage.addNewButton("list").should("be.visible"));

    //Add step to a new flow
    loadPage.addStepToNewFlowListView(stepName);
    cy.findByText("New Flow").should("be.visible");
    runPage.setFlowName(flowName);
    runPage.setFlowDescription(`${flowName} description`);
    loadPage.confirmationOptions("Save").click();
    cy.verifyStepAddedToFlow("Load", stepName);
    runPage.deleteStep(stepName).click();
    loadPage.confirmationOptions("Yes").click();

    //Verify Run in an existing flow
    cy.waitUntil(() => toolbar.getLoadToolbarIcon()).click();
    loadPage.loadView("table").click();
    loadPage.runStepInCardView(stepName).click();
    loadPage.runStepInExistingFlow(stepName, flowName);
    loadPage.addStepToFlowRunConfirmationMessage().should("be.visible");
    loadPage.confirmationOptions("Yes").click();
    cy.verifyStepAddedToFlow("Load", stepName);
    //Upload file to start running, test with invalid input
    cy.uploadFile("input/test-1.json");
    cy.verifyStepRunResult("success", "Ingestion", stepName);
    tiles.closeRunMessage();

    //Delete the flow
    runPage.deleteFlow(flowName).click();
    runPage.deleteFlowConfirmationMessage(flowName).should("be.visible");
    loadPage.confirmationOptions("Yes").click();

    //Verify Run in a new flow
    cy.waitUntil(() => toolbar.getLoadToolbarIcon()).click();
    loadPage.loadView("table").click();
    loadPage.runStepInCardView(stepName).click();
    loadPage.runInNewFlow(stepName).click({force: true});
    cy.findByText("New Flow").should("be.visible");
    runPage.setFlowName(flowName);
    runPage.setFlowDescription(`${flowName} description`);
    loadPage.confirmationOptions("Save").click();
    cy.verifyStepAddedToFlow("Load", stepName);
    //Upload file to start running
    cy.uploadFile("input/test-1.json");
    cy.verifyStepRunResult("success", "Ingestion", stepName);
    tiles.closeRunMessage();
    runPage.deleteStep(stepName).click();
    loadPage.confirmationOptions("Yes").click();

    //Delete the flow
    runPage.deleteFlow(flowName).click();
    runPage.deleteFlowConfirmationMessage(flowName).should("be.visible");
    loadPage.confirmationOptions("Yes").click();

    //Verify Delete
    cy.waitUntil(() => toolbar.getLoadToolbarIcon()).click();
    loadPage.loadView("table").click();
    loadPage.deleteStep(stepName).click();
    loadPage.confirmationOptions("No").click();
    loadPage.stepName(stepName).should("be.visible");
    loadPage.deleteStep(stepName).click();
    loadPage.confirmationOptions("Yes").click();
    loadPage.stepName(stepName).should("not.be.visible");

  });

  it("Verifies CRUD functionality from card view and run in a flow", () => {
    let stepName = "cyCardView";
    let flowName= "newE2eFlow";
    //Verify Cancel
    loadPage.loadView("th-large").click();
    loadPage.addNewButton("card").click();
    loadPage.stepNameInput().type(stepName);
    loadPage.stepDescriptionInput().type("cyTestDesc");
    loadPage.selectSourceFormat("TEXT");
    loadPage.selectTargetFormat("TEXT");
    loadPage.uriPrefixInput().type("/e2eLoad/");
    loadPage.cancelButton().click();
    cy.findByText("Discard changes?").should("be.visible");
    loadPage.confirmationOptions("No").click();
    loadPage.cancelButton().click();
    loadPage.confirmationOptions("Yes").click();
    cy.findByText(stepName).should("not.be.visible");

    //Verify Save
    loadPage.addNewButton("card").click();
    loadPage.stepNameInput().type(stepName);
    loadPage.stepDescriptionInput().type("cyTestDesc");
    loadPage.uriPrefixInput().type("/e2eJSON/");
    loadPage.saveButton().click();
    cy.findByText(stepName).should("be.visible");

    //Verify Edit
    loadPage.editStepInCardView(stepName).click();
    loadPage.stepNameInput().should("be.disabled");
    loadPage.stepDescriptionInput().clear().type("UPDATE");
    loadPage.saveButton().click();
    cy.waitForAsyncRequest();
    loadPage.stepName(stepName).should("be.visible");

    //Verify Advanced Settings
    cy.waitForAsyncRequest();
    loadPage.editStepInCardView(stepName).click();
    loadPage.switchEditAdvanced().click(); // Advanced tab
    loadPage.selectTargetDB("STAGING");
    loadPage.targetCollectionInput().type("e2eTestCollection{enter}test1{enter}test2{enter}");
    cy.findByText("Default Collections").click();
    loadPage.defaultCollections(stepName).should("be.visible");
    loadPage.setTargetPermissions("data-hub-common,read,data-hub-common,update");
    loadPage.selectProvGranularity("Off");
    loadPage.setBatchSize("200");
    //Verify JSON error
    cy.get("#headers").clear().type("{").tab();
    loadPage.jsonValidateError().should("be.visible");
    loadPage.setHeaderContent("loadTile/headerContent");
    //Verify JSON error
    cy.findByText("Interceptors").click();
    cy.get("#interceptors").clear().type("[\"test\": \"fail\"]").tab();
    loadPage.jsonValidateError().should("be.visible");
    cy.findByText("Interceptors").click(); //closing the interceptor text area
    loadPage.setStepInterceptor("");
    //Verify JSON error
    cy.findByText("Custom Hook").click();
    cy.get("#customHook").clear().type("{test}", {parseSpecialCharSequences: false}).tab();
    loadPage.jsonValidateError().should("be.visible");
    cy.findByText("Custom Hook").click(); //closing the custom hook text area
    loadPage.setCustomHook("");
    loadPage.cancelSettings(stepName).click();
    loadPage.confirmationOptions("No").click();
    loadPage.saveSettings(stepName).click();
    cy.waitForAsyncRequest();
    loadPage.stepName(stepName).should("be.visible");

    //Cancel Add to New Flow
    loadPage.addStepToNewFlow(stepName);
    cy.findByText("New Flow").should("be.visible");
    loadPage.confirmationOptions("Cancel").click();
    //should route user back to load page card view
    cy.waitUntil(() => loadPage.addNewButton("card").should("be.visible"));

    //Verify Add to New Flow
    loadPage.addStepToNewFlow(stepName);
    cy.findByText("New Flow").should("be.visible");
    runPage.setFlowName(flowName);
    runPage.setFlowDescription(`${flowName} description`);
    loadPage.confirmationOptions("Save").click();
    cy.verifyStepAddedToFlow("Load", stepName);
    runPage.deleteStep(stepName).click();
    loadPage.confirmationOptions("Yes").click();

    //Verify Run Load step in an Existing Flow
    cy.waitUntil(() => toolbar.getLoadToolbarIcon()).click();
    cy.waitUntil(() => loadPage.addNewButton("card").should("be.visible"));
    loadPage.runStepInCardView(stepName).click();
    loadPage.runStepInExistingFlow(stepName, flowName);
    loadPage.addStepToFlowRunConfirmationMessage().should("be.visible");
    loadPage.confirmationOptions("Yes").click();
    cy.verifyStepAddedToFlow("Load", stepName);
    //Upload file to start running, test with invalid input
    cy.uploadFile("input/test-1");
    cy.verifyStepRunResult("failed", "Ingestion", stepName)
      .should("contain.text", "Document is not JSON");
    tiles.closeRunMessage();

    //Run the flow with JSON input
    runPage.runStep(stepName).click();
    cy.uploadFile("input/test-1.json");
    cy.verifyStepRunResult("success", "Ingestion", stepName);
    tiles.closeRunMessage();
    runPage.deleteStep(stepName).click();
    loadPage.confirmationOptions("Yes").click();
    //Delete the flow
    runPage.deleteFlow(flowName).click();
    runPage.deleteFlowConfirmationMessage(flowName).should("be.visible");
    loadPage.confirmationOptions("Yes").click();

    //Verify Run Load step in a New Flow
    cy.waitUntil(() => toolbar.getLoadToolbarIcon()).click();
    cy.waitUntil(() => loadPage.addNewButton("card").should("be.visible"));
    loadPage.runStepInCardView(stepName).click();
    loadPage.runInNewFlow(stepName).click({force: true});
    cy.findByText("New Flow").should("be.visible");
    runPage.setFlowName(flowName);
    runPage.setFlowDescription(`${flowName} description`);
    loadPage.confirmationOptions("Save").click();
    cy.verifyStepAddedToFlow("Load", stepName);
    //Upload file to start running
    cy.uploadFile("input/test-1.json");
    cy.verifyStepRunResult("success", "Ingestion", stepName);
    tiles.closeRunMessage();
    runPage.deleteStep(stepName).click();
    loadPage.confirmationOptions("Yes").click();

    //Verify Add to Existing Flow after changing source/target format to TEXT
    cy.waitUntil(() => toolbar.getLoadToolbarIcon()).click();
    cy.waitUntil(() => loadPage.addNewButton("card").should("be.visible"));
    loadPage.loadView("th-large").click();
    loadPage.editStepInCardView(stepName).click();
    loadPage.selectSourceFormat("TEXT");
    loadPage.selectTargetFormat("TEXT");
    loadPage.saveButton().click();
    cy.waitForAsyncRequest();
    loadPage.stepName(stepName).should("be.visible");
    loadPage.addStepToExistingFlow(stepName, flowName);
    loadPage.addStepToFlowConfirmationMessage().should("be.visible");
    loadPage.confirmationOptions("Yes").click();
    cy.verifyStepAddedToFlow("Load", stepName);

    //Run the flow with TEXT input
    runPage.runLastStepInAFlow(stepName).last().click();
    cy.uploadFile("input/test-1.txt");
    cy.verifyStepRunResult("success", "Ingestion", stepName);
    tiles.closeRunMessage();

    //Delete the flow
    runPage.deleteFlow(flowName).click();
    runPage.deleteFlowConfirmationMessage(flowName).should("be.visible");
    loadPage.confirmationOptions("Yes").click();

    //Verify Delete step
    cy.waitUntil(() => toolbar.getLoadToolbarIcon()).click();
    cy.waitUntil(() => loadPage.addNewButton("card").should("be.visible"));
    loadPage.deleteStep(stepName).click();
    loadPage.confirmationOptions("No").click();
    loadPage.stepName(stepName).should("be.visible");
    loadPage.deleteStep(stepName).click();
    loadPage.confirmationOptions("Yes").click();
    loadPage.stepName(stepName).should("not.be.visible");
  });

  it("Verify ingestion for csv filetype", () => {
    let stepName = "cyCSVTest";
    let flowName= "csvE2eFlow";
    loadPage.loadView("th-large").click();
    loadPage.addNewButton("card").click();
    loadPage.stepNameInput().type(stepName);
    loadPage.stepDescriptionInput().type("cyTestDesc");
    loadPage.selectSourceFormat("Delimited Text (CSV, TSV, etc.)");
    loadPage.selectTargetFormat("XML");
    loadPage.uriPrefixInput().type("/e2eCSV/");
    loadPage.saveButton().click();
    cy.findByText(stepName).should("be.visible");

    loadPage.addStepToNewFlow(stepName);
    cy.findByText("New Flow").should("be.visible");
    runPage.setFlowName(flowName);
    runPage.setFlowDescription(`${flowName} description`);
    loadPage.confirmationOptions("Save").click();
    cy.verifyStepAddedToFlow("Load", stepName);

    runPage.runStep(stepName).click();
    cy.uploadFile("input/test-1.csv");
    cy.verifyStepRunResult("success", "Ingestion", stepName);
    tiles.closeRunMessage();
  });

  it("Verify ingestion for zip filetype", () => {
    let stepName = "cyZIPTest";
    let flowName= "zipE2eFlow";
    loadPage.loadView("th-large").click();
    loadPage.addNewButton("card").click();
    loadPage.stepNameInput().type(stepName);
    loadPage.stepDescriptionInput().type("cyTestDesc");
    loadPage.selectSourceFormat("BINARY (.gif, .jpg, .pdf, .doc, .docx, etc.)");
    loadPage.selectTargetFormat("BINARY (.gif, .jpg, .pdf, .doc, .docx, etc.)");
    loadPage.uriPrefixInput().type("/e2eBinary/");
    loadPage.saveButton().click();
    cy.findByText(stepName).should("be.visible");

    loadPage.addStepToNewFlow(stepName);
    cy.findByText("New Flow").should("be.visible");
    runPage.setFlowName(flowName);
    runPage.setFlowDescription(`${flowName} description`);
    loadPage.confirmationOptions("Save").click();
    cy.verifyStepAddedToFlow("Load", stepName);

    runPage.runStep(stepName).click();
    cy.get("#fileUpload").attachFile("input/test-1.zip");
    cy.verifyStepRunResult("success", "Ingestion", stepName);
    tiles.closeRunMessage();
  });

  it("Verify ingestion for xml filetype", () => {
    let stepName = "cyXMTest";
    let flowName= "xmlE2eFlow";
    loadPage.loadView("th-large").click();
    loadPage.addNewButton("card").click();
    loadPage.stepNameInput().type(stepName);
    loadPage.stepDescriptionInput().type("cyTestDesc");
    loadPage.selectSourceFormat("XML");
    loadPage.selectTargetFormat("XML");
    loadPage.uriPrefixInput().type("/e2eXml/");
    loadPage.saveButton().click();
    cy.findByText(stepName).should("be.visible");

    loadPage.addStepToNewFlow(stepName);
    cy.findByText("New Flow").should("be.visible");
    runPage.setFlowName(flowName);
    runPage.setFlowDescription(`${flowName} description`);
    loadPage.confirmationOptions("Save").click();
    cy.verifyStepAddedToFlow("Load", stepName);

    runPage.runStep(stepName).click();
    cy.uploadFile("input/test-1.xml");
    cy.verifyStepRunResult("success", "Ingestion", stepName);

    //Verify step name appears as a collection facet in explorer
    runPage.explorerLink().click();
    browsePage.waitForSpinnerToDisappear();
    cy.waitForAsyncRequest();

    browsePage.waitForCardToLoad();
    browsePage.getTotalDocuments().should("eq", 1);
    browsePage.getFacet("collection").should("exist");
    browsePage.getFacetItemCheckbox("collection", stepName).should("be.visible");
  });

});

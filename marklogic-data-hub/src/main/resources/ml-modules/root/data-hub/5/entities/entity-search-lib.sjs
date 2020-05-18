/**
 Copyright (c) 2020 MarkLogic Corporation

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */
'use strict';

const ds = require("/data-hub/5/data-services/ds-utils.sjs");
const es = require('/MarkLogic/entity-services/entity-services');

// TODO Will move this to /data-hub/5/entities soon
const entityLib = require("/data-hub/5/impl/entity-lib.sjs");

/**
 * If the entity instance cannot be found for any search result, that fact is logged instead of an error being thrown or
 * trace logging being used. This ensures that the condition appears in logging, but it should not throw an error
 * because other entities in the search results may be able to have properties added for them.
 *
 * @param entityName
 * @param searchResponse
 */
function addPropertiesToSearchResponse(entityName, searchResponse, propertiesToDisplay) {
  const maxDefaultProperties = 5;
  const selectedPropertyNames = typeof propertiesToDisplay === 'string' ? propertiesToDisplay.split(",") : propertiesToDisplay;
  let selectedPropertyMetadata = [];
  let propertyMetadata = [];

  if (entityName != null) {
    //Single Entity is selected

    const entityModel = entityLib.findModelByEntityName(entityName);
    const entityInfo = {
      "entityName": entityName,
      "entityModel": entityModel
    };
    if (!entityModel) {
      ds.throwServerError(`Could not add entity properties to search response; could not find an entity model for entity name: ${entityName}`);
    }

    const allMetadata = buildAllMetadata("", entityModel, entityName);
    propertyMetadata = allMetadata["allPropertiesMetadata"];

    if (selectedPropertyNames) {
      selectedPropertyMetadata = buildSelectedPropertiesMetadata(allMetadata, selectedPropertyNames);
    }
    selectedPropertyMetadata = selectedPropertyMetadata.length > 0 ? selectedPropertyMetadata : propertyMetadata.slice(0, maxDefaultProperties);
    // Add entityProperties to each search result
    searchResponse.results.forEach(result => {
      addEntitySpecificProperties(result, entityInfo, selectedPropertyMetadata)
    });

  } else {
    //'All Entities' option is selected
    searchResponse.results.forEach(result => {
      addGenericEntityProperties(result);
    });
  }

  // Make it easy for the client to know which property names were used, and which ones exist
  searchResponse.selectedPropertyDefinitions = selectedPropertyMetadata;
  searchResponse.entityPropertyDefinitions = propertyMetadata;
}

// This function builds the logical entityType property metadata for all entityType properties from an entityModel.
function buildAllMetadata(parentPropertyName, entityModel, entityName) {
  const entityType = entityModel.definitions[entityName];
  if (!entityType) {
    ds.throwServerError("Could not build property metadata; could not find entity type with name: " + entityName);
  }

  const allPropertiesMetadata = [];
  let granularPropertyMetadata = {};

  for (var propertyName of Object.keys(entityType.properties)) {
    const property = entityType.properties[propertyName];

    const isSimpleProperty = property.datatype != "array" && !property["$ref"];
    const isSimpleArrayProperty = property.datatype == "array" && (property["items"] && !property["items"]["$ref"]);
    const isStructuredProperty = property.datatype != "array" && property["$ref"];
    const isStructuredArrayProperty = property.datatype == "array" && (property["items"] && property["items"]["$ref"]);

    const propertyMetadata = {};
    const propertyMetadataObject = {};

    propertyMetadata["propertyPath"] = parentPropertyName ? parentPropertyName + "." + propertyName : propertyName;
    propertyMetadataObject["propertyPath"] = propertyMetadata["propertyPath"];

    propertyMetadata["propertyLabel"] = propertyName;
    propertyMetadataObject["propertyLabel"] = propertyName;

    propertyMetadata["datatype"] = (isSimpleProperty || isSimpleArrayProperty) ? (isSimpleProperty ? property.datatype : property["items"]["datatype"]) : "object";
    propertyMetadataObject["datatype"] = propertyMetadata["datatype"];

    propertyMetadata["multiple"] = (isSimpleArrayProperty || isStructuredArrayProperty) ? true : false;
    propertyMetadataObject["multiple"] = propertyMetadata["multiple"];

    if(property.sortable && !(isStructuredProperty || isStructuredArrayProperty)) {
      propertyMetadata["sortable"] =  property.sortable;
      propertyMetadataObject["sortable"] = property.sortable;
    }

    if(property.facetable && !(isStructuredProperty || isStructuredArrayProperty)) {
      propertyMetadata["facetable"] =  property.facetable;
      propertyMetadataObject["facetable"] = property.facetable;
    }

    if (isStructuredProperty || isStructuredArrayProperty) {
      let referenceInfo = isStructuredProperty ? property["$ref"].split("/") : property["items"]["$ref"].split("/");
      if (referenceInfo[0] !== "#") {
        // As of 5.3.0, relationship properties are ignored; we won't include data from them in search results
        continue;
      }
      entityName = referenceInfo.pop();
      const metaData = buildAllMetadata(propertyMetadata["propertyPath"], entityModel, entityName);
      propertyMetadata["properties"] = metaData["allPropertiesMetadata"];
      propertyMetadataObject["properties"] = metaData["allPropertiesMetadata"];

      granularPropertyMetadata = Object.assign({},granularPropertyMetadata, metaData["granularPropertyMetadata"]);
    }
    granularPropertyMetadata[propertyMetadataObject["propertyPath"]] = propertyMetadataObject;
    allPropertiesMetadata.push(propertyMetadata);
  }

  const allMetadata = {};
  allMetadata["allPropertiesMetadata"] = allPropertiesMetadata;
  allMetadata["granularPropertyMetadata"] = granularPropertyMetadata;

  return allMetadata;
}

// This function builds the logical entityType property metadata for all entityType properties from metadata
// built by buildAllMetadata.
function buildPropertyMetadata(parentPropertyName, entityModel, entityName) {
  let metaData = buildAllMetadata(parentPropertyName, entityModel, entityName);
  return metaData["allPropertiesMetadata"];
}

// This function builds the logical entityType property metadata for selected entityType properties by user from metadata
// built by buildAllMetadata.
function buildSelectedPropertiesMetadata(allMetadata, selectedPropertyNames) {
  const granularPropertyMetadata = JSON.parse(JSON.stringify(allMetadata["granularPropertyMetadata"]));
  const selectedPropertyDefinitions = {};
  const selectedPropertyDefinitionsArray = [];

  selectedPropertyNames.forEach((selectedPropertyName) => {
    const selectedPropertyNameArray = selectedPropertyName.split(".");
    const actualSelectedPropertyName = selectedPropertyNameArray.pop();

    if(selectedPropertyNameArray.length > 0) {
      const parentPropertyName = selectedPropertyNameArray[0];
      if(selectedPropertyDefinitions[parentPropertyName]) {
        selectedPropertyDefinitions[parentPropertyName] = updateSelectedPropertyMetadata(selectedPropertyName, selectedPropertyDefinitions, granularPropertyMetadata);
      } else {
        let finalMetadataProperty = buildAndCacheSelectedPropertyMetadata(selectedPropertyName, selectedPropertyDefinitions, granularPropertyMetadata);
        if(Object.keys(finalMetadataProperty).length > 0) {
          selectedPropertyDefinitions[parentPropertyName] = finalMetadataProperty;
        }
      }
    } else {
      if(granularPropertyMetadata[actualSelectedPropertyName]) {
        selectedPropertyDefinitionsArray.push(granularPropertyMetadata[actualSelectedPropertyName]);
      }
    }
  });

  Object.keys(selectedPropertyDefinitions).forEach(key => selectedPropertyDefinitionsArray.push(selectedPropertyDefinitions[key]));
  return selectedPropertyDefinitionsArray;
}

function updateSelectedPropertyMetadata(selectedPropertyName, selectedPropertyDefinitions, granularPropertyMetadata) {
  const selectedPropertyNameArray = selectedPropertyName.split(".");
  const actualSelectedPropertyName = selectedPropertyNameArray.pop();
  const parentPropertyName = selectedPropertyNameArray[0];
  let structuredPropertyPath = "";
  let updatedMetadataObject = JSON.parse(JSON.stringify(selectedPropertyDefinitions[parentPropertyName]));
  let temporaryMetadataObject = updatedMetadataObject;

  selectedPropertyNameArray.forEach((propertyName) => {
    propertyName = structuredPropertyPath ? structuredPropertyPath + "." + propertyName : propertyName;
    structuredPropertyPath = propertyName;

    if(Array.isArray(temporaryMetadataObject)) {
      if(temporaryMetadataObject.map(property => property.propertyPath).includes(propertyName)) {
        temporaryMetadataObject = temporaryMetadataObject.find(property => property.propertyPath === propertyName)["properties"];
      } else {
        let missingProperty = granularPropertyMetadata[structuredPropertyPath];
        missingProperty['properties'] = [];
        temporaryMetadataObject.push(missingProperty);
        temporaryMetadataObject = temporaryMetadataObject.find(property => property.propertyPath === propertyName)["properties"];
      }
    } else {
      temporaryMetadataObject = temporaryMetadataObject["properties"];
    }
  });
  temporaryMetadataObject.push(JSON.parse(JSON.stringify(granularPropertyMetadata[structuredPropertyPath + "." + actualSelectedPropertyName])));
  return updatedMetadataObject;
}

function buildAndCacheSelectedPropertyMetadata(selectedPropertyName, selectedPropertyDefinitions, granularPropertyMetadata) {
  const selectedPropertyNameArray = selectedPropertyName.split(".");
  const actualSelectedPropertyName = selectedPropertyNameArray.pop();
  let structuredPropertyPath = "";
  let selectedPropertyMetadataBuilder = [];

  selectedPropertyNameArray.forEach((propertyName) => {
    propertyName = structuredPropertyPath ? structuredPropertyPath + "." + propertyName : propertyName;
    structuredPropertyPath = propertyName;
    let metadataObject = granularPropertyMetadata[propertyName] ? JSON.parse(JSON.stringify(granularPropertyMetadata[propertyName])) : {};
    delete metadataObject["properties"];
    selectedPropertyMetadataBuilder.push(metadataObject);
  });
  if(granularPropertyMetadata[structuredPropertyPath + "." + actualSelectedPropertyName]) {
    selectedPropertyMetadataBuilder.push(granularPropertyMetadata[structuredPropertyPath + "." + actualSelectedPropertyName]);
  } else {
    selectedPropertyMetadataBuilder = [];
  }
  selectedPropertyMetadataBuilder.reverse();

  let currentProperties = [];
  let finalMetadataProperty = {};
  selectedPropertyMetadataBuilder.forEach((metadataProperty) => {
    if(currentProperties.length > 0) {
      metadataProperty["properties"] = currentProperties;
    }
    currentProperties = [].concat(JSON.parse(JSON.stringify(metadataProperty)));
    finalMetadataProperty = currentProperties.length > 0 ? metadataProperty : {};
  });
  return finalMetadataProperty;
}

function getEntityInstance(docUri) {
  let doc = cts.doc(docUri);
  if(doc instanceof Element || doc instanceof XMLDocument) {
    const builder = new NodeBuilder();
    return fn.head(es.instanceJsonFromDocument(builder.startDocument().addNode(doc.xpath("/*:envelope/*:instance")).endDocument().toNode())).toObject();
  }
  return doc.toObject().envelope.instance;
}

function getPropertyValues(currentProperty, entityInstance) {
  let resultObject = {};
  resultObject.propertyPath = currentProperty.propertyPath;

  if(currentProperty.datatype === "object") {
    resultObject.propertyValue = [];

    let propertyName = currentProperty.propertyPath.split(".").pop();
    if(!entityInstance[propertyName] || Object.keys(entityInstance[propertyName]).length == 0) {
      return resultObject;
    }

    if(currentProperty.multiple) {
      entityInstance = entityInstance[propertyName];
      entityInstance.forEach((instance) => {
        let currentPropertyValueArray = [];
        let childPropertyName = Object.keys(instance)[0];
        instance = instance[childPropertyName];
        currentProperty.properties.forEach((property) => {
          currentPropertyValueArray.push(getPropertyValues(property, instance));
        });
        resultObject.propertyValue.push(currentPropertyValueArray);
      });
    } else {
      let currentPropertyValueArray = [];
      let childPropertyName = Object.keys(entityInstance[propertyName])[0];
      entityInstance = entityInstance[propertyName][childPropertyName];
      currentProperty.properties.forEach((property) => {
        currentPropertyValueArray.push(getPropertyValues(property, entityInstance));
      });
      resultObject.propertyValue.push(currentPropertyValueArray);
    }
  } else {
    let propertyName = currentProperty.propertyPath.split(".").pop();
    resultObject.propertyValue = entityInstance[propertyName] ? entityInstance[propertyName] :
        (currentProperty.multiple ? [] : "");
  }
  return resultObject;
}

// returns null to use uri
function getPrimaryValue(entityInstance, entityDefinition) {
  let primaryKeyData = {}
  if (entityDefinition.hasOwnProperty("primaryKey")) {
    let primaryKey = entityDefinition.primaryKey;

    if (entityInstance.hasOwnProperty(primaryKey)) {
      let primaryKeyValue = entityInstance[primaryKey];

      if (primaryKeyValue === null || String(primaryKeyValue).trim().length === 0) {
        return null;
      } else {
        primaryKeyData.propertyPath = primaryKey;
        primaryKeyData.propertyValue = primaryKeyValue;
        return primaryKeyData;
      }
    } else { // no primaryKey in entityInstance, so use uri
      return null;
    }
  } else { // no primaryKey in entityDef, so use uri
    return null;
  }
}

// Helper function to add properties to each result instance under results array in searchResponse
function addEntitySpecificProperties(result, entityInfo, selectedPropertyMetadata) {
  let instance = null;
  let entityTitle = entityInfo.entityName;
  let createdOnDate = "";
  result.entityProperties = [];
  result.entityName = "";
  result.createdOn = "";

  try {
    instance = getEntityInstance(result.uri);
  } catch (error) {
    console.log(`Unable to obtain entity instance from document with URI '${result.uri}'; will not add entity properties to its search result`);
  }

  try {
    createdOnDate = xdmp.documentGetMetadata(result.uri).datahubCreatedOn;
  } catch (error) {
    console.log(`Unable to obtain document with URI '${result.uri}'; will not add createdOn date to its search result`);
  }

  if (instance != null) {
    let entityDef = entityInfo.entityModel.definitions[entityTitle];
    const entityInstance = instance[entityTitle];
    if (!entityInstance) {
      console.log(`Unable to obtain entity instance from document with URI '${result.uri}' and entity name '${entityTitle}'; will not add entity properties to its search result`);
    } else {
      selectedPropertyMetadata.forEach(parentProperty => {
        result.entityProperties.push(getPropertyValues(parentProperty, entityInstance));
      });

      addPrimaryKeyToResult(result, entityInstance, entityDef);
    }
  }
  result.entityName = entityTitle;
  result.createdOn = createdOnDate;
}

function addGenericEntityProperties(result) {
  let instance = null;
  let entityTitle = "";
  let createdOnDate = "";
  let entityModel = {};
  result.primaryKey = {};
  result.identifier = {};
  result.entityName = "";
  result.createdOn = "";

  try {
    instance = getEntityInstance(result.uri);
  } catch (error) {
    console.log(`Unable to obtain entity instance from document with URI '${result.uri}'; will not add entity properties to its search result`);
  }

  if (instance != null) {
    let isEntityInstance = instance.hasOwnProperty("info") ? true : (Object.keys(instance).length > 1 ? false : true);
    if(isEntityInstance) {
    entityTitle = instance.hasOwnProperty("info") ? instance.info.title : Object.keys(instance)[0];
    entityModel = entityLib.findModelByEntityName(entityTitle);
    let entityDef = entityModel.definitions[entityTitle];
    const entityInstance = instance[entityTitle];
    if (!entityInstance) {
      console.log(`Unable to obtain entity instance from document with URI '${result.uri}' and entity name '${entityTitle}'; will not add entity properties to its search result`);
    } else {
        addPrimaryKeyToResult(result, entityInstance, entityDef);
    }
    } else {
      console.log(`Unable to obtain a valid entity instance from document with URI '${result.uri}'; will not add entity properties to its search result`);
    }
  }
  try {
    createdOnDate = xdmp.documentGetMetadata(result.uri).datahubCreatedOn;
  } catch (error) {
    console.log(`Unable to obtain document with URI '${result.uri}'; will not add createdOn date to its search result`);
  }
  let identifierValue = result.primaryKey.propertyPath === "uri" ? result.uri : result.primaryKey.propertyValue;
  result.identifier = {
    "propertyPath": "identifier",
    "propertyValue": identifierValue
  };
  result.entityName = entityTitle;
  result.createdOn = createdOnDate;
}

function addPrimaryKeyToResult(result, entityInstance, entityDef) {
      result.primaryKey = getPrimaryValue(entityInstance, entityDef);

      // no primaryKey in entity instance, so use URI
      if (result.primaryKey === null) {
        result.primaryKey = {
          "propertyPath": "uri",
          "propertyValue": result.uri
        }
      }
}

module.exports = {
  addPropertiesToSearchResponse,
  buildPropertyMetadata: buildPropertyMetadata,
  getEntityInstance: getEntityInstance
};
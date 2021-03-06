/**
 Copyright (c) 2021 MarkLogic Corporation

 Licensed under the Apache License, Version 2.0 (the 'License');
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an 'AS IS' BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */
'use strict';

xdmp.securityAssert('http://marklogic.com/data-hub/privileges/read-mapping', 'execute');

const core = require('/data-hub/5/artifacts/core.sjs')
const httpUtils = require("/data-hub/5/impl/http-utils.sjs");
const sourcePropsLib = require('./sourcePropertiesLib.sjs');

var stepName, uri;

const response = {
  data: null,
  namespaces: {},
  format: null,
  sourceProperties: []
}

// Offer the mapping step to define the doc's database.
const mappingStep = core.getArtifact('mapping', stepName);
let doc;
if (mappingStep.sourceDatabase) {
  doc = fn.head(xdmp.eval(`cts.doc('${uri}')`, null, {database: xdmp.database(mappingStep.sourceDatabase)}));
} else {
  doc = cts.doc(uri);
}

if (doc === null) {
  httpUtils.throwNotFound(`Could not find a document with URI: ${uri}`);
}

// Populate return object.
response.format = doc.documentFormat;
const isJson = response.format.toUpperCase() === 'JSON';
if (isJson) {
  response.data = (doc.root.hasOwnProperty('envelope') && doc.root.envelope.hasOwnProperty('instance')) ?
    doc.root.envelope.instance :
    doc.root;
} else {
  let xmlNode = fn.head(doc.root.xpath("/es:envelope/es:instance/node()", {"es":"http://marklogic.com/entity-services"}))
  if (xmlNode === null) {
    xmlNode = doc.root;
  }
  const transformResult = require('./xmlToJsonForMapping.sjs').transform(xmlNode);
  response.data = transformResult.data;
  response.namespaces = transformResult.namespaces;
}
response.sourceProperties = sourcePropsLib.buildSourceProperties(response.data, isJson);

response;

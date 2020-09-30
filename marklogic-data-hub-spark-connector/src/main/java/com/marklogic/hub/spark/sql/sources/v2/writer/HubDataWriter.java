/*
 * Copyright 2020 MarkLogic Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.marklogic.hub.spark.sql.sources.v2.writer;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.marklogic.client.dataservices.InputEndpoint;
import com.marklogic.client.ext.helper.LoggingObject;
import com.marklogic.client.io.StringHandle;
import com.marklogic.hub.HubClient;
import org.apache.spark.sql.catalyst.InternalRow;
import org.apache.spark.sql.catalyst.json.JSONOptions;
import org.apache.spark.sql.catalyst.json.JacksonGenerator;
import org.apache.spark.sql.catalyst.util.DateTimeUtils;
import org.apache.spark.sql.sources.v2.writer.DataWriter;
import org.apache.spark.sql.sources.v2.writer.WriterCommitMessage;
import org.apache.spark.sql.types.StructType;

import java.io.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

public class HubDataWriter extends LoggingObject implements DataWriter<InternalRow> {

    private List<String> records;
    private InputEndpoint.BulkInputCaller loader;
    private StructType schema;
    private int batchSize;

    /**
     *
     * @param hubClient
     * @param schema
     * @param params contains all the params provided by Spark, which will include all connector-specific properties
     */
    public HubDataWriter(HubClient hubClient, StructType schema, Map<String, String> params) {
        this.records = new ArrayList<>();
        this.schema = schema;
        this.batchSize = params.containsKey("batchsize") ? Integer.parseInt(params.get("batchsize")) : 100;

        JsonNode endpointParamsJsonNode = determineIngestionEndpointParams(params);

        this.loader = InputEndpoint.on(
            hubClient.getStagingClient(),
            hubClient.getModulesClient().newJSONDocumentManager().read(endpointParamsJsonNode.get("apiPath").asText(), new StringHandle())
        ).bulkCaller();

        this.loader.setEndpointState(new ByteArrayInputStream((endpointParamsJsonNode.get("endpointState").asText()).getBytes()));
        this.loader.setWorkUnit(new ByteArrayInputStream((endpointParamsJsonNode.get("workUnit").asText()).getBytes()));
    }

    @Override
    public void write(InternalRow record) {
        records.add(convertRowToJSONString(record));
        if (records.size() == batchSize) {
            logger.debug("Writing records as batch size of " + batchSize + " has been reached");
            writeRecords();
        }
    }

    @Override
    public WriterCommitMessage commit() {
        if (!this.records.isEmpty()) {
            logger.debug("Writing records on commit");
            writeRecords();
        }
        return null;
    }

    @Override
    public void abort() {
        throw new UnsupportedOperationException("Transaction cannot be aborted");
    }

    private void writeRecords() {
        int recordCount = records.size();
        Stream.Builder<InputStream> builder = Stream.builder();
        for (int i = 0; i < recordCount; i++) {
            builder.add(new ByteArrayInputStream(records.get(i).getBytes()));
        }
        Stream<InputStream> input = builder.build();
        input.forEach(loader::accept);
        loader.awaitCompletion();
        logger.debug("Wrote records, count: " + recordCount);
        this.records.clear();
    }

    private String convertRowToJSONString(InternalRow record) {
        StringWriter jsonObjectWriter = new StringWriter();
        scala.collection.immutable.Map<String, String> emptyMap = scala.collection.immutable.Map$.MODULE$.empty();
        JacksonGenerator jacksonGenerator = new JacksonGenerator(
            schema,
            jsonObjectWriter,
            new JSONOptions(emptyMap, DateTimeUtils.TimeZoneUTC().getID(), "")
        );
        jacksonGenerator.write(record);
        jacksonGenerator.flush();
        return jsonObjectWriter.toString();
    }

    protected JsonNode determineIngestionEndpointParams(Map<String, String> params) {
        ObjectMapper objectMapper = new ObjectMapper();

        String ingestEndpointParams = params.containsKey("ingestendpointparams")?
            params.get("ingestendpointparams"):objectMapper.createObjectNode().toString();

        JsonNode endpointParamsJsonNode;
        try {
            endpointParamsJsonNode = objectMapper.readValue(ingestEndpointParams, JsonNode.class);
        } catch (IOException e) {
            throw new RuntimeException("Unable to parse ingestendpointparams, cause: " + e.getMessage(), e);
        }

        boolean doesNotHaveApiPath = !endpointParamsJsonNode.has("apiPath");
        boolean hasWorkUnitOrEndpointState = endpointParamsJsonNode.has("workUnit") || endpointParamsJsonNode.has("endpointState");
        if (doesNotHaveApiPath && hasWorkUnitOrEndpointState) {
            throw new RuntimeException("Cannot set workUnit or endpointState in ingestionendpointparams unless apiPath is defined as well.");
        }

        final String apiModulePath = (endpointParamsJsonNode.hasNonNull("apiPath") &&
            endpointParamsJsonNode.get("apiPath").asText().length() > 0) ?
            endpointParamsJsonNode.get("apiPath").asText() : "/data-hub/5/data-services/ingestion/bulkIngester.api";
        logger.info("Will write to endpoint defined by: " + apiModulePath);
        ((ObjectNode)endpointParamsJsonNode).put("apiPath", apiModulePath);

        if (endpointParamsJsonNode.hasNonNull("endpointState") && endpointParamsJsonNode.get("endpointState").asText().length() > 0) {
            ((ObjectNode)endpointParamsJsonNode).set("endpointState", endpointParamsJsonNode.get("endpointState"));
        }
        // TODO : remove the below else block after java-client-api 5.3 release
        else {
            ((ObjectNode)endpointParamsJsonNode).put("endpointState", "{}");
        }
        String uriPrefix = params.get("uriprefix")!=null? params.get("uriprefix"):"";
        if (endpointParamsJsonNode.hasNonNull("workUnit") && endpointParamsJsonNode.get("workUnit").asText().length() > 0) {

            JsonNode workUnitNode;
            try {
                workUnitNode = objectMapper.readValue(endpointParamsJsonNode.get("workUnit").asText(), JsonNode.class);
            } catch (JsonProcessingException e) {
                throw new RuntimeException("Unable to parse workUnit, cause: " + e.getMessage(), e);
            }
            ((ObjectNode) workUnitNode).put("uriprefix", uriPrefix);
            ((ObjectNode)endpointParamsJsonNode).set("workUnit", workUnitNode);
        } else {
            ((ObjectNode)endpointParamsJsonNode).put("workUnit", "{\"uriprefix\":\"" + uriPrefix + "\"}");
        }
        return endpointParamsJsonNode;
    }
}

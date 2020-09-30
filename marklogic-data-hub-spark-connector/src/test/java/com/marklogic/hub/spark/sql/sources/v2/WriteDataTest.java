package com.marklogic.hub.spark.sql.sources.v2;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.marklogic.client.eval.EvalResultIterator;
import org.apache.spark.sql.SaveMode;
import org.apache.spark.sql.catalyst.InternalRow;
import org.apache.spark.sql.catalyst.expressions.GenericInternalRow;
import org.apache.spark.sql.sources.v2.writer.DataSourceWriter;
import org.apache.spark.sql.sources.v2.writer.DataWriter;
import org.apache.spark.sql.sources.v2.writer.DataWriterFactory;
import org.apache.spark.sql.types.DataTypes;
import org.apache.spark.sql.types.Metadata;
import org.apache.spark.sql.types.StructField;
import org.apache.spark.sql.types.StructType;
import org.apache.spark.unsafe.types.UTF8String;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

public class WriteDataTest extends AbstractSparkConnectorTest {

    private final static StructType SCHEMA = new StructType(new StructField[]{
        new StructField("fruitName", DataTypes.StringType, true, Metadata.empty()),
        new StructField("fruitColor", DataTypes.StringType, true, Metadata.empty()),
    });

    @Test
    void ingestThreeFruitsWithBatchSizeOfTwo() throws IOException {
        DataWriter<InternalRow> dataWriter = buildDataWriter(new Options(getHubPropertiesAsMap()).withBatchSize(2).withUriPrefix("/testFruit"));

        verifyFruitCount(0, "Shouldn't have any fruits ingested yet");

        dataWriter.write(buildRow("apple", "red"));
        verifyFruitCount(0, "Still shouldn't have any fruits ingested yet because batchSize is 2");

        dataWriter.write(buildRow("banana", "yellow"));
        verifyFruitCount(2, "Since batchSize is 2 and 2 records have been written, they should have been ingested into ML");

        dataWriter.write(buildRow("canteloupe", "melon"));
        verifyFruitCount(2, "Should still be at 2 since batchSize is 2 and only 1 has been written since last ingest");

        dataWriter.commit();
        verifyFruitCount(3, "The commit call should result in the 3rd fruit being ingested");
    }


    @Test
    public void testBulkIngestWithoutUriPrefix() throws IOException {
        DataWriter<InternalRow> dataWriter = buildDataWriter(new Options(getHubPropertiesAsMap()).withBatchSize(1));
        dataWriter.write(buildRow("pineapple", "green"));

        String uriQuery = "cts.uris('', null, cts.andQuery([\n" +
            "  cts.jsonPropertyValueQuery('fruitName', 'pineapple')\n" +
            "]))";

        EvalResultIterator uriQueryResult = getHubClient().getStagingClient().newServerEval().javascript(uriQuery).eval();
        assertTrue(uriQueryResult.hasNext());
        String uri = uriQueryResult.next().getString();

        assertTrue(uri.endsWith(".json"));

        assertFalse(uri.startsWith("/"), "If the user wants the URI to start with a forward slash, the user must provide one. " +
            "If the user doesn't, then it's assumed that the user doesn't want a forward slash at the start of the URI, so the endpoint will not add one automatically.");
        assertFalse(uriQueryResult.hasNext());
    }

    @Test
    public void ingestWithoutCustomApiWithCustomWorkunit(){
        ObjectNode customWorkUnit = objectMapper.createObjectNode();
        customWorkUnit.put("userDefinedValue", 0);

        RuntimeException ex = assertThrows(RuntimeException.class,
            () -> buildDataWriter(new Options(getHubPropertiesAsMap()).withIngestWorkUnit(customWorkUnit)),
            "Expected an error because a custom work unit was provided without a custom API path"
        );
        assertEquals("Cannot set workUnit or endpointState in ingestionendpointparams unless apiPath is defined as well.", ex.getMessage());
    }

    @Test
    public void ingestWithIncorrectApi(){
        RuntimeException ex = assertThrows(RuntimeException.class,
            () -> buildDataWriter(new Options(getHubPropertiesAsMap()).withIngestApiPath("/incorrect.api")),
            "Expected an error because a custom work unit was provided without a custom API path"
        );
        System.out.println(ex.getMessage());
        assertTrue( ex.getMessage().contains("Could not read non-existent document."));
    }

    /**
     * Spark will do all of this in the real world - i.e. a user will specify the entry class and the set of options.
     * But in a test, we need to do that ourselves. So we create the DataSource class, build up the params, and then
     * call the factory/writer methods ourselves.
     *
     * @param options
     * @return
     */
    private DataWriter<InternalRow> buildDataWriter(Options options) {
        HubDataSource dataSource = new HubDataSource();
        final String writeUUID = "doesntMatter";
        final SaveMode saveModeDoesntMatter = SaveMode.Overwrite;

        // Get the set of DHF properties used to connect to ML as a map, and then add connector-specific params

        Optional<DataSourceWriter> dataSourceWriter = dataSource.createWriter(writeUUID, SCHEMA, saveModeDoesntMatter, options.toDataSourceOptions());
        DataWriterFactory<InternalRow> dataWriterFactory = dataSourceWriter.get().createWriterFactory();

        final int partitionIdDoesntMatter = 0;
        final long taskId = 2;
        final int epochIdDoesntMatter = 0;
        return dataWriterFactory.createDataWriter(partitionIdDoesntMatter, taskId, epochIdDoesntMatter);
    }

    private GenericInternalRow buildRow(String... values) {
        Object[] rowValues = new Object[values.length];
        for (int i = 0; i < values.length; i++) {
            rowValues[i] = UTF8String.fromString(values[i]);
        }
        return new GenericInternalRow(rowValues);
    }

    private void verifyFruitCount(int expectedCount, String message) {
        String query = "cts.uriMatch('/testFruit**').toArray().length";
        String count = getHubClient().getStagingClient().newServerEval().javascript(query).evalAs(String.class);
        assertEquals(expectedCount, Integer.parseInt(count), message);

        if (expectedCount > 0) {
        String uriQuery = "cts.uris('', null, cts.andQuery([\n" +
            "  cts.directoryQuery('/'),\n" +
            "  cts.jsonPropertyValueQuery('fruitName', 'apple')\n" +
            "]))";

        EvalResultIterator uriQueryResult = getHubClient().getStagingClient().newServerEval().javascript(uriQuery).eval();
        assertTrue(uriQueryResult.hasNext());
        assertTrue(uriQueryResult.next().getString().startsWith("/testFruit"));
        assertFalse(uriQueryResult.hasNext());

        uriQuery = "cts.uris('', null, cts.andQuery([\n" +
            "  cts.directoryQuery('/'),\n" +
            "  cts.jsonPropertyValueQuery('fruitName', 'banana')\n" +
            "]))";

        uriQueryResult = getHubClient().getStagingClient().newServerEval().javascript(uriQuery).eval();
        assertTrue(uriQueryResult.hasNext());
        assertTrue(uriQueryResult.next().getString().startsWith("/testFruit"));
        assertFalse(uriQueryResult.hasNext());
        }
    }
}

package com.marklogic.hub.core;

import com.marklogic.hub.DatabaseKind;
import com.marklogic.hub.HubConfig;
import com.marklogic.hub.HubTestBase;
import com.marklogic.hub.impl.HubConfigImpl;
import org.apache.commons.io.FileUtils;
//import org.apache.htrace.fasterxml.jackson.databind.ObjectMapper;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Properties;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;



import com.fasterxml.jackson.databind.ObjectMapper;


public class HubConfigTest extends HubTestBase {

    private static File projectPath = new File(PROJECT_PATH);

    @Before
    public void setup() throws IOException {
        FileUtils.deleteDirectory(projectPath);
        HubConfig config = getHubConfig();
        config.initHubProject();
    }

    private void deleteProp(String key) {
        try {
            File gradleProperties = new File(projectPath, "gradle.properties");
            Properties props = new Properties();
            FileInputStream fis = new FileInputStream(gradleProperties);
            props.load(fis);
            fis.close();
            props.remove(key);
            FileOutputStream fos = new FileOutputStream(gradleProperties);
            props.store(fos, "");
            fos.close();
        }
        catch(IOException e) {
            throw new RuntimeException(e);
        }
    }
    private void writeProp(String key, String value) {
        try {
            File gradleProperties = new File(projectPath, "gradle.properties");
            Properties props = new Properties();
            FileInputStream fis = new FileInputStream(gradleProperties);
            props.load(fis);
            fis.close();
            props.put(key, value);
            FileOutputStream fos = new FileOutputStream(gradleProperties);
            props.store(fos, "");
            fos.close();
        }
        catch(IOException e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    public void testLoadBalancerProps() {
        deleteProp("mlLoadBalancerHosts");
        assertNull(getHubConfig().getLoadBalancerHosts());

        writeProp("mlLoadBalancerHosts", "");
        assertNull(getHubConfig().getLoadBalancerHosts());

        writeProp("mlLoadBalancerHosts", "host1,host2");
        HubConfig config = getHubConfig();
        assertEquals(2, config.getLoadBalancerHosts().length);
        assertEquals("host1", config.getLoadBalancerHosts()[0]);
        assertEquals("host2", config.getLoadBalancerHosts()[1]);

        writeProp("mlLoadBalancerHosts", "host1");
        config = getHubConfig();
        assertEquals(1, config.getLoadBalancerHosts().length);
        assertEquals("host1", config.getLoadBalancerHosts()[0]);
    }

    @Test
    public void testHubInfo() {//throws org.apache.htrace.fasterxml.jackson.core.JsonProcessingException {
        //logger.error(getHubConfig().toString());
        HubConfig config = getHubConfig();
        System.out.println("HTTP Name: " + config.getHttpName(DatabaseKind.STAGING));


        ObjectMapper objmapper = new ObjectMapper();
        try {
            //String str = objmapper.writeValueAsString(getHubConfig());
            //System.out.println("SUCCESSFUL: " + str);
            System.out.println(objmapper.writerWithDefaultPrettyPrinter().writeValueAsString(getHubConfig()));
        }
        catch(Exception e) {
         System.out.println("FAILED: " + e);

        }


    }

    /*@Test
    public void testHubInfo2() {

        Rectangle rect = new Rectangle(5, 6);
        ObjectMapper objmapper = new ObjectMapper();
        try {
            System.out.println(objmapper.writerWithDefaultPrettyPrinter().writeValueAsString(this));
        }
        catch(Exception e)
        {
            System.out.println("FAILED: " + e);

        }
    }*/

}

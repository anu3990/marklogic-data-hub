const test = require("/test/test-helper.xqy");
const stepValidate = require("/data-hub/5/extensions/stepValidate.sjs");


function checkPermissions() {
  let operatorRole = xdmp.role("flow-operator-role").toString();
  let modPerms = fn.head(xdmp.eval('xdmp.documentGetPermissions("/data-hub/5/extensions/stepValidate.sjs")', null,
    {
      "database" : xdmp.database(xdmp.databaseName(xdmp.modulesDatabase()))
    }));
  return [
    test.assertEqual(true, stepValidate.checkPermissions(modPerms, operatorRole),
      "This document should have right permissions for 'flowOperator'")
  ];
}


function moduleStaticCheck() {
xdmp.log(stepValidate.staticCheck("/test/suites/data-hub/5/impl/extensions/lib/invalidModule.sjs"));
  return [
    test.assertEqual("JS-JAVASCRIPT: let id = content.uri; -- Error running JavaScript request: SyntaxError: Unexpected identifier in /test/suites/data-hub/5/impl/extensions/lib/invalidModule.sjs, at 31:2 [javascript]"
    , stepValidate.staticCheck("/test/suites/data-hub/5/impl/extensions/lib/invalidModule.sjs"),
      "Invalid module"),
    test.assertEqual(null, stepValidate.staticCheck("/data-hub/5/extensions/stepValidate.sjs"),
      "Valid module")
  ];
}

[]
  .concat(checkPermissions())
  .concat(moduleStaticCheck());
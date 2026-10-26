# Lambda Function Development

## File structure

The code for all Lambda functions belongs inside the `lambda` directory. Groups of related
lambda functions can be bundled under subdirectories of `lambda` if desired. The entry
code for a lambda function should be put into a file with a name following `kebab-case`.

**Example:**

```
lambda/category/
|-- function-name.ts        # can be .js, .mjs, .jsx, .tsx, .cjs, .cts
|-- ...
```

## Lambda function code

The entry file for the lambda function **must** export a function called `handler`. When
the lambda function is wired up to the Rest API Gateway as a Lambda Proxy Integration, this
handler function receives an object containing a bunch of information about the request. A
full specification of the input object can be found
[here](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format).
The handler function must return an object following a particular format which can be found
[here](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-output-format).

You can import the `APIGatewayProxyEvent` and `APIGatewayProxyResult` types from
`aws-lambda` and use them to specify the parameter and return types on your `handler`
function. **Use the following code as a starter template:**

```ts
// lambda/category/function-name.ts
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  // ...
};
```

### Code organization

To make the lambda function easier to test, you should separate the event handling logic
from the core business logic. The `handler` function should be responsible for extract URL
and body parameters, validating the input, and bundling the output into the shape that the
API gateway expects. In the middle, it should defer the core behavior to a dedicated
function.

**The following code can be used as a template for this pattern**. The `handler` function
should parse the JSON `event.body` object (passed as a string), validates that all
required fields are present, then call the `logic` function to perform the core operation
(_you should rename `logic` to be a more descriptive name_). Additionally, the `LogicArgs`
and `LogicResult` describe the input and output parameters for the function (_these should
also be renamed accordingly_).

```ts
// lambda/category/function-name.ts
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const args = JSON.parse(event.body ?? "{}");

  // ... check that required arguments are present, return HTTP 400 if not

  const result = logic(args); // replace
  // Check if logic function reported an error
  return {
    body: JSON.stringify(result),
    // ... (other required API gateway parameters)
  };
};

export interface LogicArgs {
  // ... Arguments for the core logic. These most likely correspond to parameters in
  //    the JSON request body
}

export interface LogicResult {
  // ... Return object for the core logic. These most likely correspond to parameters in
  //    the JSON response body
}

export function logic(args: LogicArgs): LogicResult {
  // Do core logic ...
}
```

### Writing unit cases

Two categories of test cases:

- Logic test: tests the core logic function (i.e., the `logic` function)
- Handler test: tests the event `handler` function (parsing parameters, etc.)

#### Logic tests

Test cases for the **core logic function** should be put in a file
`test/function-name.test.ts`, where `function-name` is the same name as the lambda
function file. In this file, create test inputs and outputs to the core handler function.
The `describeCases` helper function (defined in `test/helpers/describeCases`) can help
with this.

```sh
// test/function-name.test.ts
import { logic } from "../lambda/category/function-name";
import { describeCases } from "./helpers/describeCases";

// Test cases for the logic function. Change "logic" to the name of the function
describeCases("logic", logic, [
  { input: { /* object passed to `logic` */ }, expected: { /* object returned by `logic` */ } },
  // ...
]);
```

Be sure to write several test cases that cover all the edge cases. If your logic function
talks to the database, be aware that the tests will timeout since you cannot connect to
the database unless you are inside the VPC.

> [!CAUTION]
> For now, do not write tests for database functions. We can try to figure out a way to
> test these functions later.

#### Handler tests

To test the `handler` function, create two files inside `test/events/function-name/`
(replace `logic` with the actual name of the logic function):

- `logic.event.json`
- `logic.expected.json`

Copy the JSON payloads from the provided template files (`test/TEMPLATE.event.json` and
`test/TEMPLATE.expected.json`) and replace anything that has comments. One test case with
all possible parameters is sufficient.

After that, create a file `test/function-name.handler.test` that calls your `handler`
function. **Use the following code as a starter template**:

```ts
import { readFileSync } from "fs";
import { join } from "path";
import { handler } from "../lambda/category/function-name"; // replace with actual function

const event = JSON.parse(
  // Replace function-name and logic
  readFileSync(
    join(__dirname, "events", "function-name", "logic.event.json"),
    "utf-8",
  ),
);

test("function-name handler test", async () => {
  const result = await handler(event);

  expect(result.statusCode).toBe(200);
  expect(JSON.parse(result.body)).toEqual({/* response fields */});
});
```

### Running tests

Run lambda function logic unit tests:

```sh
npm run test
```

Run lambda function handler test with SAM CLI (requires
[AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
to be installed).

```sh
npm run test:sam
```

## Connecting to API gateway

**To connect a Lambda function to the API Gateway**, you need to construct a
`NodeJsFunction` object inside `ApiStack` (`lib/api-stack.ts`). Note that although the
file containing the function is named `function-name.ts` (kebab-case), the construct
should be named like `FunctionName` (PascalCase). In the `NodeJsFunction` props, you must
pass the following parameters:

- `entry`: path to the file containing the exported `handler` function
- `runtime`: NodeJS version to use. Should be `NODEJS_22_X` in most cases

The following is an example of a minimal `NodeJsFunction`:

```ts
export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ...

    const functionName = new nodejs.NodejsFunction(this, "FunctionName", {
      entry: path.join(
        __dirname,
        "..",
        "lambda",
        "category",
        "function-name.ts",
      ),
      runtime: lambda.Runtime.NODEJS_22_X,
    });

    // ...
  }
}
```

If the function will be connecting to the database, then it must be added to the virtual
private cloud and be part of the `LambdaSg` security group (see
`docs/virtual-private-cloud.md`). This can be done by setting some additional parameters
in the `NodeJsFunction` object, as shown below:

```ts
// Put these lines somewhere in `api-stack.ts` (they are likely already there)
const vpc = ec2.Vpc.fromLookup(this, "Vpc", { vpcName: SHARED_VPC_NAME });
const lambdaSg = ec2.SecurityGroup.fromLookupByName(
  this,
  "LambdaSg",
  SHARED_LAMBDA_SG_NAME,
  vpc,
);

const functionName = new nodejs.NodejsFunction(this, "FunctionName", {
  // existing parameters ...

  // Add these new ones:
  vpc,
  vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
  securityGroups: [lambdaSg],
});
```

Note that if the function is part of the VPC, then it loses all outside internet access.

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
The `buildResponse` helper function (defined in `lambda/response-builder`) can be used to
construct an object with all the required fields.

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

To make the lambda function easier to test, you should separate the event handling logic
from the core business logic. The `handler` function should be responsible for extracting
URL and body parameters, validating the input, and bundling the output into the shape that
the API gateway expects. In the middle, it should defer the core behavior to a dedicated
function.

### Input validation

Input validation can be done using the [Zod](https://zod.dev/) library, which lets you
define schemas for objects, which will be useful for validating JSON body parameters, path
parameters, and query parameters.

To start, define a [Zod schema](https://zod.dev/api) for each of your input objects. Zod
allows you to specify parameter types, formats, bounds, whether they are optional, and
even relationships between parameters (e.g., `highQualityThreshold` >
`lowQualityThreshold`). Click the link to see all of Zod's powerful features.

Example from `lambda/echo.ts`:

```ts
import * as z from "zod";

// Schema for path parameters
const pathSchema = z.object({
  quantity: z.int().nonnegative(),
});

// Schema for body parameters
const bodySchema = z.object({
  text: z.string().nonempty(),
});
```

Inside the `handler` function, use the `validate` helper function (defined in
`lambda/validation.ts`) to validate the inputs. This function returns an object with two
fields, `result` and `errors`, which can be unpacked and renamed using the following
syntax:

```ts
// Inside handler function
const pathParams = event.pathParameters || {};
const { result: validatedPath, errors: pathErrors } = validate(pathSchema, pathParams);
```

A similar pattern can be used for body parameters. Note that `JSON.parse` should be
wrapped in a try/catch since it throws an error if the JSON body is invalid.

```ts
// Inside handler function

// Parse body
let bodyArgs;
try {
  bodyArgs = JSON.parse(event.body ?? "{}");
} catch {
  return buildResponse(400, {
    error: "Invalid JSON body",
  });
}

// Validate body
const { result: validatedBody, errors: bodyErrors } = validate(bodySchema, bodyArgs);
```

Only one of `result` or `errors` will be defined depending on whether the input is valid
or not. You should rename the fields to avoid conflicts with other variables inside the
function. The `errors` field is a list of error objects naming the problematic fields and
an error message for each field. This list can be returned as-is from your lambda
function. The `result` field is an object containing all the fields you defined in your
Zod schema.

After calling validate, you should check for errors and return HTTP 400 (bad request) if
there are any. For our example, we return 400 if there are errors in the path or the body:

```ts
// Inside handler function
if (pathErrors || bodyErrors) {
  return buildResponse(400, {
    error: "Input error",
    pathErrors,
    bodyErrors,
  });
}
```

After handling the error case, you can access the input fields from the validated `result`
objects returned by `validate`.

```ts
// Inside handler function
let text = validatedBody.text;
let quantity = validatedPath.quantity;
```

### Logic code

Code for business logic should be defined in a separate function. The following is
template code for this pattern. We have a `logic` function to handle the business logic,
and interfaces `LogicArgs`, `LogicResult`, and `LogicError` for the function (_you should
rename the function and interfaces to be more descriptive_).

```ts
// lambda/category/function-name.ts
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

export interface LogicArgs {
  // ... Arguments for the core logic. These most likely correspond to parameters in
  //    the JSON request body
}

export interface LogicResult {
  // ... Return object for the core logic. These most likely correspond to parameters in
  //    the JSON response body
}

export interface LogicError {
  // Return object if there is an error during logic. Usually just an error
  error: string;
}

export async function logic(args: LogicArgs): Promise<LogicResult | LogicError> {
  // Do core logic ...
}
```

In the `handler` function, you can call `logic` and return the result with the appropriate
response code:

```ts
const result = logic({ /* logic args */ });

// Return 400 on error or 200 on success
const status = "error" in result ? 400 : 200;
return buildResponse(status, result);
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

To test the `handler` function, create two files inside `test/events/FunctionName/`
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

The `createLambda` helper function in `ApiStack` can help with the construction of lambda
functions. It takes in an object with the following props:
- `id`: ID for the lambda function (should be in PascalCase)
- `entry`: entry path of the lambda function
- `dbAccess`: boolean flag that should be set to true if the lambda function needs
  database access (see below)

### Database environment variables

Every stage has its own database on the shared RDS instance, named after the stage (e.g.
the `asuyer` stage uses the `asuyer` database). A Lambda function finds its database
through four environment variables, which are set in its `NodeJsFunction` props:

| Variable  | Value                                                         |
| --------- | ------------------------------------------------------------- |
| `DB_HOST` | Endpoint address of the shared RDS instance (`raser-shared-db`) |
| `DB_PORT` | Port of the shared RDS instance (`5432`)                      |
| `DB_NAME` | The stage name, which is also the name of the stage's database |
| `DB_USER` | Always `raser_admin`                                          |

`ApiStack` does not import `DatabaseStack` directly. Instead, it looks up the shared
instance by its identifier, the same way it looks up the VPC by name. Look the instance
up once in `ApiStack`, then pass the same `dbEnvironment` object to every function that
talks to the database:

```ts
import * as rds from "aws-cdk-lib/aws-rds";

// Put these lines somewhere in `api-stack.ts` (they are likely already there)
const stageName = cdk.Stage.of(this)?.stageName ?? "default";
const db = rds.DatabaseInstance.fromLookup(this, "Database", {
  instanceIdentifier: "raser-shared-db",
});
const dbEnvironment = {
  DB_HOST: db.dbInstanceEndpointAddress,
  DB_PORT: db.dbInstanceEndpointPort,
  DB_NAME: stageName,
  DB_USER: "raser_admin",
};

const functionName = new nodejs.NodejsFunction(this, "FunctionName", {
  // existing parameters (including the VPC ones above) ...

  // Add this new one:
  environment: { ...dbEnvironment },
});
```

Never hard-code a database name in a function. Taking `DB_NAME` from the stage name is
what keeps each developer's stage (and `staging`/`production`) on its own data.

Inside the function, read the values from `process.env`:

```ts
// lambda/category/function-name.ts
const { DB_HOST, DB_PORT, DB_NAME, DB_USER } = process.env;
```

To look at the same database from your laptop, set `RASER_STAGE` to your stage name and
run `scripts/db-connect.sh`. It connects to the database named `$RASER_STAGE`.


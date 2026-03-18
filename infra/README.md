# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region (Defaults to `prod`)
* `npx cdk deploy -c stage=stg`  deploy to the Staging environment
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template

## Multi-Stage Deployment
This project supports multiple environments (stages) using CDK context.
- `prod` (Default): Production environment. Stack ID: `InfraStack`.
- `stg`: Staging environment. Stack ID: `InfraStack-stg`.

When deploying to staging, resource names for DynamoDB, S3, Cognito, and API Gateway will be suffixed with `-stg` to avoid conflicts.

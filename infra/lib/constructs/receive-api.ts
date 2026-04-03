import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { RECEIVE_ALLOW_HEADERS } from '../../../shared/constants';

export interface ReceiveApiProps {
  table: dynamodb.ITable;
  bucket: s3.IBucket;
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
  api: apigateway.RestApi;
  commonProps: any;
  allowedOrigins: string[];
  grantTablePermissions: (fn: lambda.IFunction, write?: boolean) => void;
}

export class ReceiveApi extends cdk.NestedStack {
  public readonly receiveResource: apigateway.Resource;

  constructor(scope: cdk.Stack, id: string, props: ReceiveApiProps) {
    super(scope, id);

    const { table, bucket, userPool, userPoolClient, api, commonProps, allowedOrigins, grantTablePermissions } = props;

    // Helper for lambda paths
    const lampath = (name: string) => path.join(__dirname, `../../lambda/${name}.ts`);
    const authpath = (name: string) => path.join(__dirname, `../../lambda/authorizer/${name}.ts`);

    // --- Receive Authorizer (Custom Lambda Authorizer) ---
    const receive_authorizer_fn = new nodejs.NodejsFunction(this, 'receive_authorizer_fn', {
      entry: authpath('receiveAuthorizer'),
      environment: {
        TABLE_NAME: table.tableName,
        USER_POOL_ID: userPool.userPoolId,
        CLIENT_ID: userPoolClient.userPoolClientId,
      },
    });
    grantTablePermissions(receive_authorizer_fn, true);

    const authorizer = new apigateway.RequestAuthorizer(this, 'receive_authorizer', {
      handler: receive_authorizer_fn,
      identitySources: [
        apigateway.IdentitySource.header('x-qr-id'),
        apigateway.IdentitySource.header('x-qr-pin'),
      ],
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

    // --- Lambda Definitions ---
    const fnProps = {
      ...commonProps,
      environment: {
        ...commonProps.environment,
        TABLE_NAME: table.tableName,
        BUCKET_NAME: bucket.bucketName,
      },
      bundling: {
        externalModules: ['@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
      }
    };

    const receive_verify = new nodejs.NodejsFunction(this, 'receive_verify', {
      entry: lampath('receive_verify'),
      ...fnProps,
      environment: {
        ...fnProps.environment,
        USER_POOL_ID: userPool.userPoolId,
      }
    });

    const receive_submit = new nodejs.NodejsFunction(this, 'receive_submit', {
      entry: lampath('receive_submit'),
      ...fnProps,
      environment: {
        ...fnProps.environment,
        SENDER_EMAIL: process.env.SENDER_EMAIL || '',
        USER_POOL_ID: userPool.userPoolId,
        CLIENT_ID: userPoolClient.userPoolClientId,
      }
    });

    const receive_completed = new nodejs.NodejsFunction(this, 'receive_completed', { entry: lampath('receive_completed'), ...fnProps });
    const receive_chat = new nodejs.NodejsFunction(this, 'receive_chat', { entry: lampath('receive_chat'), ...fnProps });
    const receive_subscription = new nodejs.NodejsFunction(this, 'receive_subscription', { entry: lampath('receive_subscription'), ...fnProps });

    // Pass userPool details to receive_sender for history logging
    const receive_sender = new nodejs.NodejsFunction(this, 'receive_sender', {
      entry: lampath('receive_sender'),
      ...fnProps,
      environment: {
        ...fnProps.environment,
        USER_POOL_ID: userPool.userPoolId,
        CLIENT_ID: userPoolClient.userPoolClientId,
      }
    });

    const receive_upload_url = new nodejs.NodejsFunction(this, 'receive_upload_url', { entry: lampath('receive_upload_url'), ...fnProps });

    // --- Share API (No Authorizer) ---
    const share_get = new nodejs.NodejsFunction(this, 'share_get', {
      entry: lampath('share_get'),
      ...fnProps,
    });

    // Grant Permissions
    const allLambdas = [receive_verify, receive_submit, receive_completed, receive_chat, receive_subscription, receive_sender, receive_upload_url, share_get];
    allLambdas.forEach(fn => {
      grantTablePermissions(fn, true);
      bucket.grantRead(fn);
      bucket.grantPut(fn);
      bucket.grantDelete(fn);
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['cognito-idp:AdminGetUser'],
        resources: [userPool.userPoolArn]
      }));
    });

    // --- Routes ---
    // Helper to add resource
    const addResourceWithCors = (parent: apigateway.IResource, pathPart: string): apigateway.Resource => {
      const res = parent.addResource(pathPart) as apigateway.Resource;
      res.addCorsPreflight({
        allowOrigins: allowedOrigins,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: RECEIVE_ALLOW_HEADERS,
      });
      return res;
    };

    this.receiveResource = new apigateway.Resource(this, 'ReceiveTopResource', {
      parent: api.root,
      pathPart: 'receive'
    });
    this.receiveResource.addCorsPreflight({
      allowOrigins: allowedOrigins,
      allowMethods: apigateway.Cors.ALL_METHODS,
      allowHeaders: RECEIVE_ALLOW_HEADERS,
    });

    const routeOptions = { authorizer, authorizationType: apigateway.AuthorizationType.CUSTOM };

    addResourceWithCors(this.receiveResource, 'verify').addMethod('POST', new apigateway.LambdaIntegration(receive_verify));
    addResourceWithCors(this.receiveResource, 'submit').addMethod('POST', new apigateway.LambdaIntegration(receive_submit), routeOptions);
    addResourceWithCors(this.receiveResource, 'completed').addMethod('POST', new apigateway.LambdaIntegration(receive_completed), routeOptions);

    const chatRes = addResourceWithCors(this.receiveResource, 'chat');
    addResourceWithCors(chatRes, 'get').addMethod('POST', new apigateway.LambdaIntegration(receive_chat), routeOptions);
    addResourceWithCors(chatRes, 'send').addMethod('POST', new apigateway.LambdaIntegration(receive_chat), routeOptions);

    addResourceWithCors(this.receiveResource, 'subscription').addMethod('POST', new apigateway.LambdaIntegration(receive_subscription), routeOptions);

    const senderRes = addResourceWithCors(this.receiveResource, 'sender');
    addResourceWithCors(senderRes, 'update').addMethod('POST', new apigateway.LambdaIntegration(receive_sender), routeOptions);
    addResourceWithCors(senderRes, 'load').addMethod('POST', new apigateway.LambdaIntegration(receive_sender), routeOptions);
    addResourceWithCors(senderRes, 'save').addMethod('POST', new apigateway.LambdaIntegration(receive_sender), routeOptions);
    addResourceWithCors(senderRes, 'delete-images').addMethod('POST', new apigateway.LambdaIntegration(receive_sender), routeOptions);

    const uploadUrlRoot = addResourceWithCors(this.receiveResource, 'uploadurl');
    addResourceWithCors(uploadUrlRoot, 'get').addMethod('POST', new apigateway.LambdaIntegration(receive_upload_url), routeOptions);

    // --- Share Endpoint (Public) ---
    const shareResource = api.root.addResource('share');
    const shareQrIdResource = shareResource.addResource('{qr_id}');
    shareQrIdResource.addMethod('GET', new apigateway.LambdaIntegration(share_get));
  }
}

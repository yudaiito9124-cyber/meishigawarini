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

export interface RecipientApiProps {
  table: dynamodb.ITable;
  bucket: s3.IBucket;
  userPool: cognito.IUserPool;
  api: apigateway.RestApi;
  commonProps: any;
  grantTablePermissions: (fn: lambda.IFunction, write?: boolean) => void;
}

export class RecipientApi extends Construct {
  constructor(scope: Construct, id: string, props: RecipientApiProps) {
    super(scope, id);

    const { table, bucket, userPool, api, commonProps, grantTablePermissions } = props;

    // Lambda: Recipient Submit
    const recipientSubmitFn = new nodejs.NodejsFunction(this, 'RecipientSubmitFn', {
      entry: path.join(__dirname, '../../lambda/recipient-submit.ts'),
      ...commonProps,
      environment: {
        ...commonProps.environment,
        SENDER_EMAIL: process.env.SENDER_EMAIL || '',
        USER_POOL_ID: userPool.userPoolId,
      }
    });
    grantTablePermissions(recipientSubmitFn, true);
    recipientSubmitFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [userPool.userPoolArn]
    }));

    // Lambda: Recipient Receive completed
    const recipientCompletedFn = new nodejs.NodejsFunction(this, 'RecipientCompletedFn', {
      entry: path.join(__dirname, '../../lambda/recipient-completed.ts'),
      ...commonProps,
    });
    grantTablePermissions(recipientCompletedFn, true);

    // Lambda: Recipient Upload URL
    const recipientUploadUrlFn = new nodejs.NodejsFunction(this, 'RecipientUploadUrlFn', {
      entry: path.join(__dirname, '../../lambda/recipient-upload-url.ts'),
      ...commonProps,
      environment: {
        ...commonProps.environment,
        BUCKET_NAME: bucket.bucketName,
      },
      bundling: {
        externalModules: ['@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
      }
    });
    grantTablePermissions(recipientUploadUrlFn);
    bucket.grantPut(recipientUploadUrlFn);
    bucket.grantRead(recipientUploadUrlFn);

    // Lambda: Recipient Verify PIN
    const recipientVerifyPinFn = new nodejs.NodejsFunction(this, 'RecipientVerifyPinFn', {
      entry: path.join(__dirname, '../../lambda/recipient-verify-pin.ts'),
      ...commonProps,
      environment: {
        ...commonProps.environment,
        USER_POOL_ID: userPool.userPoolId,
        BUCKET_NAME: bucket.bucketName,
      }
    });
    grantTablePermissions(recipientVerifyPinFn, true);
    bucket.grantRead(recipientVerifyPinFn);
    // Allow Lambda to fetch user attributes (email) from Cognito
    recipientVerifyPinFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [userPool.userPoolArn]
    }));

    // Lambda: Recipient Chat
    const recipientChatFn = new nodejs.NodejsFunction(this, 'RecipientChatFn', {
      entry: path.join(__dirname, '../../lambda/recipient-chat.ts'),
      ...commonProps,
      environment: {
        ...commonProps.environment,
        BUCKET_NAME: bucket.bucketName,
      }
    });
    grantTablePermissions(recipientChatFn, true);
    bucket.grantRead(recipientChatFn);
    bucket.grantPut(recipientChatFn);
    bucket.grantDelete(recipientChatFn);

    // Receiver(Recipient) Routes
    const recipientResource = api.root.addResource('recipient');
    const qrResourceRecip = recipientResource.addResource('qrcodes');

    const verifyResource = qrResourceRecip.addResource('verify');
    verifyResource.addMethod('POST', new apigateway.LambdaIntegration(recipientVerifyPinFn));

    const submitResource = recipientResource.addResource('submit');
    submitResource.addMethod('POST', new apigateway.LambdaIntegration(recipientSubmitFn));

    const completedResource = recipientResource.addResource('completed');
    completedResource.addMethod('POST', new apigateway.LambdaIntegration(recipientCompletedFn));

    const qrIdResourceRecip = qrResourceRecip.addResource('{uuid}');

    const chatResource = qrIdResourceRecip.addResource('chat');
    chatResource.addMethod('GET', new apigateway.LambdaIntegration(recipientChatFn));
    chatResource.addMethod('POST', new apigateway.LambdaIntegration(recipientChatFn));

    const uploadUrlResourceChat = qrIdResourceRecip.addResource('upload-url');
    uploadUrlResourceChat.addMethod('GET', new apigateway.LambdaIntegration(recipientUploadUrlFn));
  }
}

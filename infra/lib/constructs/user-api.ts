import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as path from 'path';

export interface UserApiProps {
  table: dynamodb.ITable;
  bucket: s3.IBucket;
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
  api: apigateway.IRestApi;
  commonProps: any;
  grantTablePermissions: (fn: lambda.IFunction, write?: boolean) => void;
}

export class UserApi extends cdk.NestedStack {
  public readonly userResource: apigateway.Resource;

  constructor(scope: cdk.Stack, id: string, props: UserApiProps) {
    super(scope, id);

    const { table, bucket, userPool, userPoolClient, api, commonProps, grantTablePermissions } = props;

    // Use Shop Authorizer logic since it correctly authorizes based on Cognito ID Token
    // If no shopId is provided in path, it simply checks token validity and returns userId.
    const lampath = (name: string) => path.join(__dirname, `../../lambda/${name}.ts`);
    const userAuthFn = new nodejs.NodejsFunction(this, 'UserAuthorizerFn', {
      entry: lampath('shopAuthorizer'),
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        CLIENT_ID: userPoolClient.userPoolClientId,
        TABLE_NAME: table.tableName,
      },
    });
    grantTablePermissions(userAuthFn);

    const authorizer = new apigateway.RequestAuthorizer(this, 'UserAuthorizer', {
      handler: userAuthFn,
      identitySources: [apigateway.IdentitySource.header('Authorization')],
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

    // Lambda Definitions
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

    const user_profile = new nodejs.NodejsFunction(this, 'user_profile', { entry: lampath('user_profile'), ...fnProps });

    // Grant Permissions
    grantTablePermissions(user_profile, true);
    bucket.grantPut(user_profile);
    bucket.grantRead(user_profile);
    bucket.grantDelete(user_profile);

    // Helper to add resource
    const addResourceWithCors = (parent: apigateway.IResource, pathPart: string): apigateway.Resource => {
      return parent.addResource(pathPart) as apigateway.Resource;
    };

    // Routes
    this.userResource = new apigateway.Resource(this, 'UserTopResource', {
      parent: api.root,
      pathPart: 'user'
    });

    const routeOptions = { authorizer, authorizationType: apigateway.AuthorizationType.CUSTOM };

    const profileResource = addResourceWithCors(this.userResource, 'profile');
    addResourceWithCors(profileResource, 'get').addMethod('POST', new apigateway.LambdaIntegration(user_profile), routeOptions);
    addResourceWithCors(profileResource, 'update').addMethod('POST', new apigateway.LambdaIntegration(user_profile), routeOptions);
    addResourceWithCors(profileResource, 'uploadurl').addMethod('POST', new apigateway.LambdaIntegration(user_profile), routeOptions);

    const receiverResource = addResourceWithCors(this.userResource, 'receiver');
    addResourceWithCors(receiverResource, 'get').addMethod('POST', new apigateway.LambdaIntegration(user_profile), routeOptions);
    addResourceWithCors(receiverResource, 'update').addMethod('POST', new apigateway.LambdaIntegration(user_profile), routeOptions);

    const historyResource = addResourceWithCors(this.userResource, 'history');
    addResourceWithCors(historyResource, 'get').addMethod('POST', new apigateway.LambdaIntegration(user_profile), routeOptions);
    addResourceWithCors(historyResource, 'sendgift').addMethod('POST', new apigateway.LambdaIntegration(user_profile), routeOptions);
  }
}

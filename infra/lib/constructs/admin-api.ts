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

export interface AdminApiProps {
  table: dynamodb.ITable;
  bucket: s3.IBucket;
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
  api: apigateway.RestApi;
  commonProps: any;
  grantTablePermissions: (fn: lambda.IFunction, write?: boolean) => void;
}

export class AdminApi extends Construct {
  constructor(scope: Construct, id: string, props: AdminApiProps) {
    super(scope, id);

    const { table, bucket, userPool, userPoolClient, api, commonProps, grantTablePermissions } = props;


    ////////////////////////////////////////////////////////////////////////////////
    // ユーザグループ(権限として取り扱い)
    // 自動作成するためのコードで、作成済みの場合はエラーになるので今後使用することはないはず…


    // // システム管理者画面等へのアクセス権 (/admin 以下へのアクセス権)
    // new cognito.CfnUserPoolGroup(this, 'AdministratorsGroup', {
    //   userPoolId: userPool.userPoolId,
    //   groupName: 'Administrators',
    //   description: 'System administrators with access to the admin dashboard',
    // });

    // // システム管理者画面等へのアクセス権 (/admin 以下へのアクセス権) & 全ユーザのショップ管理画面へのアクセス
    // new cognito.CfnUserPoolGroup(this, 'GlobalAdminsGroup', {
    //   userPoolId: userPool.userPoolId,
    //   groupName: 'GlobalAdmins',
    //   description: 'Global administrators with cross-shop access and admin dashboard access',
    // });




    ////////////////////////////////////////////////////////////////////////////////
    // Lambda関数に対する権限の付与


    const lampath = (name: string) => path.join(__dirname, `../../lambda/${name}.ts`);

    // AdminAuthorizer の作成 （ユーザーがAdminかチェックするための認証処理）
    const adminAuthorizer = new nodejs.NodejsFunction(this, 'adminAuthorizer', {
      entry: lampath('adminAuthorizer'),
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        CLIENT_ID: userPoolClient.userPoolClientId,
      },
    });
    const authorizerOfAdmin = new apigateway.TokenAuthorizer(this, 'AdminAuthorizer', {
      handler: adminAuthorizer,
      resultsCacheTtl: cdk.Duration.minutes(5),
    });
    adminAuthorizer.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [userPool.userPoolArn]
    }));


    const admin_check = new nodejs.NodejsFunction(this, 'admin_check', { entry: lampath('admin_check'), ...commonProps });

    const admin_dump = new nodejs.NodejsFunction(this, 'admin_dump', { entry: lampath('admin_dump'), ...commonProps });
    grantTablePermissions(admin_dump);

    const admin_links = new nodejs.NodejsFunction(this, 'admin_links', { entry: lampath('admin_links'), ...commonProps });
    grantTablePermissions(admin_links, true);





    // Lambda: Admin QR List
    const admin_qr_list = new nodejs.NodejsFunction(this, 'admin_qr_list', {
      entry: lampath('admin_qr_list'),
      ...commonProps,
      environment: {
        ...commonProps.environment,
        USER_POOL_ID: userPool.userPoolId,
        BUCKET_NAME: bucket.bucketName,
      }
    });
    grantTablePermissions(admin_qr_list);
    admin_qr_list.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [userPool.userPoolArn]
    }));
    bucket.grantRead(admin_qr_list);


    const admin_qr_generate = new nodejs.NodejsFunction(this, 'admin_qr_generate', { entry: lampath('admin_qr_generate'), ...commonProps });
    grantTablePermissions(admin_qr_generate, true);

    const admin_qr_ban = new nodejs.NodejsFunction(this, 'admin_qr_ban', { entry: lampath('admin_qr_ban'), ...commonProps });
    grantTablePermissions(admin_qr_ban, true);

    const admin_qr_deleteban = new nodejs.NodejsFunction(this, 'admin_qr_deleteban', { entry: lampath('admin_qr_deleteban'), ...commonProps });
    grantTablePermissions(admin_qr_deleteban, true);




    // Lambda: Admin Change Owner
    const admin_changeowner = new nodejs.NodejsFunction(this, 'admin_changeowner', {
      entry: lampath('admin_changeowner'), ...commonProps,
      environment: {
        ...commonProps.environment,
        USER_POOL_ID: userPool.userPoolId,
      }
    });
    grantTablePermissions(admin_changeowner, true);
    admin_changeowner.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [userPool.userPoolArn]
    }));


    // Lambda: Admin Card Designs
    const admin_carddesigns = new nodejs.NodejsFunction(this, 'admin_carddesigns', {
      entry: lampath('admin_carddesigns'),
      ...commonProps,
      environment: {
        ...commonProps.environment,
        BUCKET_NAME: bucket.bucketName,
      }
    });
    grantTablePermissions(admin_carddesigns, true);
    bucket.grantReadWrite(admin_carddesigns);


    const admin_shop_create = new nodejs.NodejsFunction(this, 'admin_shop_create', {
      entry: lampath('admin_shop_create'),
      ...commonProps,
      environment: {
        ...commonProps.environment,
        USER_POOL_ID: userPool.userPoolId,
      }
    });
    grantTablePermissions(admin_shop_create, true);
    admin_shop_create.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [userPool.userPoolArn]
    }));



    ////////////////////////////////////////////////////////////////////////////////
    // URLに対するLambdaの紐づけ

    // /admin
    const adminResource = api.root.addResource('admin');
    adminResource.addMethod('GET', new apigateway.LambdaIntegration(admin_check), { authorizer: authorizerOfAdmin, });
    adminResource.addResource('dump').addMethod('POST', new apigateway.LambdaIntegration(admin_dump), { authorizer: authorizerOfAdmin, });
    adminResource.addResource('links').addMethod('POST', new apigateway.LambdaIntegration(admin_links), { authorizer: authorizerOfAdmin, });
    adminResource.addResource('changeowner').addMethod('POST', new apigateway.LambdaIntegration(admin_changeowner), { authorizer: authorizerOfAdmin, });

    // /admin/qr
    const qrResource = adminResource.addResource('qr');
    qrResource.addResource('list').addMethod('POST', new apigateway.LambdaIntegration(admin_qr_list), { authorizer: authorizerOfAdmin, });
    qrResource.addResource('generate').addMethod('POST', new apigateway.LambdaIntegration(admin_qr_generate), { authorizer: authorizerOfAdmin, });
    qrResource.addResource('ban').addMethod('POST', new apigateway.LambdaIntegration(admin_qr_ban), { authorizer: authorizerOfAdmin, });
    qrResource.addResource('deleteban').addMethod('POST', new apigateway.LambdaIntegration(admin_qr_deleteban), { authorizer: authorizerOfAdmin, });

    // /admin/carddesigns
    const cardDesignsResource = adminResource.addResource('carddesigns');
    cardDesignsResource.addResource('list').addMethod('POST', new apigateway.LambdaIntegration(admin_carddesigns), { authorizer: authorizerOfAdmin, });
    cardDesignsResource.addResource('create').addMethod('POST', new apigateway.LambdaIntegration(admin_carddesigns), { authorizer: authorizerOfAdmin, });
    cardDesignsResource.addResource('uploadurl').addMethod('POST', new apigateway.LambdaIntegration(admin_carddesigns), { authorizer: authorizerOfAdmin, });
    cardDesignsResource.addResource('update').addMethod('POST', new apigateway.LambdaIntegration(admin_carddesigns), { authorizer: authorizerOfAdmin, });
    cardDesignsResource.addResource('delete').addMethod('POST', new apigateway.LambdaIntegration(admin_carddesigns), { authorizer: authorizerOfAdmin, });

    // /admin/shop
    const shopResource = adminResource.addResource('shop');
    shopResource.addResource('create').addMethod('POST', new apigateway.LambdaIntegration(admin_shop_create), { authorizer: authorizerOfAdmin, });

  }
}

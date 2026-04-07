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
import { ADMIN_ALLOW_HEADERS } from '../../../shared/constants';

export interface AdminApiProps {
  bucket: s3.IBucket;
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
  api: apigateway.RestApi;
  commonProps: any;
  allowedOrigins: string[];
  grantTablePermissions: (fn: lambda.IFunction, write?: boolean) => void;
}

export class AdminApi extends cdk.NestedStack {
  public readonly adminResource: apigateway.Resource;

  constructor(scope: cdk.Stack, id: string, props: AdminApiProps) {
    super(scope, id);

    const { bucket, userPool, userPoolClient, api, commonProps, allowedOrigins, grantTablePermissions } = props;


    ////////////////////////////////////////////////////////////////////////////////
    // ユーザグループ(権限として取り扱い)
    // 自動作成するためのコードで、作成済みの場合はエラーになるのでコメントアウト
    /*
    // システム管理者画面等へのアクセス権 (/admin 以下へのアクセス権)
    new cognito.CfnUserPoolGroup(this, 'AdministratorsGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'Administrators',
      description: 'System administrators with access to the admin dashboard',
    });

    // システム管理者画面等へのアクセス権 (/admin 以下へのアクセス権) & 全ユーザのショップ管理画面へのアクセス
    new cognito.CfnUserPoolGroup(this, 'GlobalAdminsGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'GlobalAdmins',
      description: 'Global administrators with cross-shop access and admin dashboard access',
    });
    */




    ////////////////////////////////////////////////////////////////////////////////
    // Lambda関数に対する権限の付与


    const lampath = (name: string) => path.join(__dirname, `../../lambda/${name}.ts`);
    const authpath = (name: string) => path.join(__dirname, `../../lambda/authorizer/${name}.ts`);

    // AdminAuthorizer の作成 （ユーザーがAdminかチェックするための認証処理）
    const adminAuthorizer = new nodejs.NodejsFunction(this, 'adminAuthorizer', {
      entry: authpath('adminAuthorizer'),
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        CLIENT_ID: userPoolClient.userPoolClientId,
      },
    });
    const authorizerOfAdmin = new apigateway.TokenAuthorizer(this, 'AdminAuthorizer', {
      handler: adminAuthorizer,
      identitySource: 'method.request.header.authorization',
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
    grantTablePermissions(admin_qr_list, true);
    admin_qr_list.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [userPool.userPoolArn]
    }));
    bucket.grantRead(admin_qr_list);


    const admin_qr_generate = new nodejs.NodejsFunction(this, 'admin_qr_generate', {
      entry: lampath('admin_qr_generate'),
      ...commonProps,
      environment: {
        ...commonProps.environment,
        BUCKET_NAME: bucket.bucketName,
      }
    });
    grantTablePermissions(admin_qr_generate, true);
    bucket.grantRead(admin_qr_generate);

    const admin_qr_ban = new nodejs.NodejsFunction(this, 'admin_qr_ban', {
      entry: lampath('admin_qr_ban'),
      ...commonProps,
      environment: {
        ...commonProps.environment,
        BUCKET_NAME: bucket.bucketName,
      }
    });
    grantTablePermissions(admin_qr_ban, true);
    bucket.grantRead(admin_qr_ban);

    const admin_qr_deleteban = new nodejs.NodejsFunction(this, 'admin_qr_deleteban', {
      entry: lampath('admin_qr_deleteban'),
      ...commonProps,
      environment: {
        ...commonProps.environment,
        BUCKET_NAME: bucket.bucketName,
      }
    });
    grantTablePermissions(admin_qr_deleteban, true);
    bucket.grantRead(admin_qr_deleteban);

    const admin_qr_batch = new nodejs.NodejsFunction(this, 'admin_qr_batch', {
      entry: lampath('admin_qr_batch'),
      ...commonProps,
      environment: {
        ...commonProps.environment,
        BUCKET_NAME: bucket.bucketName,
      }
    });
    grantTablePermissions(admin_qr_batch);
    bucket.grantRead(admin_qr_batch);




    // Lambda: Admin Change Owner
    const admin_changeowner = new nodejs.NodejsFunction(this, 'admin_changeowner', {
      entry: lampath('admin_changeowner'), ...commonProps,
      environment: {
        ...commonProps.environment,
        USER_POOL_ID: userPool.userPoolId,
        BUCKET_NAME: bucket.bucketName,
      }
    });
    grantTablePermissions(admin_changeowner, true);
    bucket.grantRead(admin_changeowner);
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
        BUCKET_NAME: bucket.bucketName,
      }
    });
    grantTablePermissions(admin_shop_create, true);
    bucket.grantRead(admin_shop_create);
    admin_shop_create.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [userPool.userPoolArn]
    }));

    const admin_shop_carddesign_link = new nodejs.NodejsFunction(this, 'admin_shop_carddesign_link', {
      entry: lampath('admin_shop_carddesign_link'),
      ...commonProps,
      environment: {
        ...commonProps.environment,
        BUCKET_NAME: bucket.bucketName,
      }
    });
    grantTablePermissions(admin_shop_carddesign_link, true);
    bucket.grantRead(admin_shop_carddesign_link);

    const admin_card_orders = new nodejs.NodejsFunction(this, 'admin_card_orders', {
      entry: lampath('admin_card_orders'),
      ...commonProps,
      environment: {
        ...commonProps.environment,
        BUCKET_NAME: bucket.bucketName,
      }
    });
    grantTablePermissions(admin_card_orders, true);
    bucket.grantRead(admin_card_orders);



    ////////////////////////////////////////////////////////////////////////////////
    // URLに対するLambdaの紐づけ

    // Helper to add resource
    const addResourceWithCors = (parent: apigateway.IResource, pathPart: string): apigateway.Resource => {
      const res = parent.addResource(pathPart) as apigateway.Resource;
      res.addCorsPreflight({
        allowOrigins: allowedOrigins,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ADMIN_ALLOW_HEADERS,
      });
      return res;
    };

    // /admin
    this.adminResource = new apigateway.Resource(this, 'AdminTopResource', {
      parent: api.root,
      pathPart: 'admin'
    });
    this.adminResource.addCorsPreflight({
      allowOrigins: allowedOrigins,
      allowMethods: apigateway.Cors.ALL_METHODS,
      allowHeaders: ADMIN_ALLOW_HEADERS,
    });

    this.adminResource.addMethod('GET', new apigateway.LambdaIntegration(admin_check), { authorizer: authorizerOfAdmin, });
    addResourceWithCors(this.adminResource, 'dump').addMethod('POST', new apigateway.LambdaIntegration(admin_dump), { authorizer: authorizerOfAdmin, });
    addResourceWithCors(this.adminResource, 'links').addMethod('POST', new apigateway.LambdaIntegration(admin_links), { authorizer: authorizerOfAdmin, });
    addResourceWithCors(this.adminResource, 'changeowner').addMethod('POST', new apigateway.LambdaIntegration(admin_changeowner), { authorizer: authorizerOfAdmin, });

    // /admin/qr
    const qrResource = addResourceWithCors(this.adminResource, 'qr');
    addResourceWithCors(qrResource, 'list').addMethod('POST', new apigateway.LambdaIntegration(admin_qr_list), { authorizer: authorizerOfAdmin, });
    addResourceWithCors(qrResource, 'generate').addMethod('POST', new apigateway.LambdaIntegration(admin_qr_generate), { authorizer: authorizerOfAdmin, });
    addResourceWithCors(qrResource, 'ban').addMethod('POST', new apigateway.LambdaIntegration(admin_qr_ban), { authorizer: authorizerOfAdmin, });
    addResourceWithCors(qrResource, 'deleteban').addMethod('POST', new apigateway.LambdaIntegration(admin_qr_deleteban), { authorizer: authorizerOfAdmin, });

    // /admin/qr/batch/get
    const batchResource = addResourceWithCors(qrResource, 'batch');
    addResourceWithCors(batchResource, 'get').addMethod('POST', new apigateway.LambdaIntegration(admin_qr_batch), { authorizer: authorizerOfAdmin, });

    // /admin/carddesigns
    const cardDesignsResource = addResourceWithCors(this.adminResource, 'carddesigns');
    addResourceWithCors(cardDesignsResource, 'list').addMethod('POST', new apigateway.LambdaIntegration(admin_carddesigns), { authorizer: authorizerOfAdmin, });
    addResourceWithCors(cardDesignsResource, 'create').addMethod('POST', new apigateway.LambdaIntegration(admin_carddesigns), { authorizer: authorizerOfAdmin, });
    addResourceWithCors(cardDesignsResource, 'uploadurl').addMethod('POST', new apigateway.LambdaIntegration(admin_carddesigns), { authorizer: authorizerOfAdmin, });
    addResourceWithCors(cardDesignsResource, 'update').addMethod('POST', new apigateway.LambdaIntegration(admin_carddesigns), { authorizer: authorizerOfAdmin, });
    addResourceWithCors(cardDesignsResource, 'delete').addMethod('POST', new apigateway.LambdaIntegration(admin_carddesigns), { authorizer: authorizerOfAdmin, });

    // /admin/shop
    const shopResource = addResourceWithCors(this.adminResource, 'shop');
    addResourceWithCors(shopResource, 'create').addMethod('POST', new apigateway.LambdaIntegration(admin_shop_create), { authorizer: authorizerOfAdmin, });

    // /admin/shop/carddesign/link
    const cardRes = addResourceWithCors(shopResource, 'carddesign');
    const cardDesignLinkResource = addResourceWithCors(cardRes, 'link');
    addResourceWithCors(cardDesignLinkResource, 'get').addMethod('POST', new apigateway.LambdaIntegration(admin_shop_carddesign_link), { authorizer: authorizerOfAdmin, });
    addResourceWithCors(cardDesignLinkResource, 'update').addMethod('POST', new apigateway.LambdaIntegration(admin_shop_carddesign_link), { authorizer: authorizerOfAdmin, });

    // /admin/card/orders
    const cardOrderRoot = addResourceWithCors(this.adminResource, 'card');
    const adminCardOrdersResource = addResourceWithCors(cardOrderRoot, 'orders');
    addResourceWithCors(adminCardOrdersResource, 'list').addMethod('POST', new apigateway.LambdaIntegration(admin_card_orders), { authorizer: authorizerOfAdmin, });
    addResourceWithCors(adminCardOrdersResource, 'update').addMethod('POST', new apigateway.LambdaIntegration(admin_card_orders), { authorizer: authorizerOfAdmin, });
    addResourceWithCors(adminCardOrdersResource, 'create').addMethod('POST', new apigateway.LambdaIntegration(admin_card_orders), { authorizer: authorizerOfAdmin, });
    addResourceWithCors(adminCardOrdersResource, 'get').addMethod('POST', new apigateway.LambdaIntegration(admin_card_orders), { authorizer: authorizerOfAdmin, });


  }
}

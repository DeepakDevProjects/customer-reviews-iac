// CDK stack that provisions S3, Lambda functions, EventBridge rule, and API Gateway for customer reviews.
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
import * as path from 'path';

export class CustomerReviewsIacStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get PR number from context (passed via --context prNumber=xxx)
    const prNumber = this.node.tryGetContext('prNumber') || 'default';
    const prSuffix = prNumber !== 'default' ? `-pr-${prNumber}` : '';

    // S3 bucket to store HTML review fragments
    const reviewsBucket = new s3.Bucket(this, 'ReviewsFragmentsBucket', {
      bucketName: `customer-reviews-fragments${prSuffix}-${this.account}`,
      publicReadAccess: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      }),
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Mock API Lambda (serves fake review data)
    const mockApiLambda = new lambda.Function(this, 'MockApiLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler.handler',
      functionName: `mock-api-lambda${prSuffix}`,
      code: lambda.Code.fromAsset(
        path.join(process.cwd(), 'customer-reviews-app/dist/mock-api')
      ),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      description: 'Mock API that returns fake product review data',
    });

    // API Gateway for mock API Lambda
    const mockApi = new apigateway.LambdaRestApi(this, 'MockApiGateway', {
      handler: mockApiLambda,
      restApiName: `CustomerReviewsMockAPI${prSuffix}`,
      description: 'Mock API Gateway for customer reviews data',
      proxy: true,
    });

    // Reviews Lambda (fetches from mock API, renders HTML, saves to S3)
    const reviewsLambda = new lambda.Function(this, 'ReviewsLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      functionName: `customer-reviews-lambda${prSuffix}`,
      code: lambda.Code.fromAsset(
        path.join(process.cwd(), 'customer-reviews-app/dist')
      ),
      environment: {
        API_BASE_URL: mockApi.url,
        PRODUCT_IDS: 'product-a,product-b',
        OUTPUT_BUCKET: reviewsBucket.bucketName,
        // Note: AWS_REGION is automatically provided by Lambda runtime, no need to set it
      },
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      description: 'Fetches reviews and generates HTML fragments in S3',
    });

    // Grant S3 write permissions to reviews Lambda
    reviewsBucket.grantWrite(reviewsLambda);

    // EventBridge rule to trigger reviews Lambda every hour
    const hourlyRule = new events.Rule(this, 'HourlyReviewsUpdate', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
      description: 'Triggers reviews Lambda every hour to update fragments',
    });

    hourlyRule.addTarget(new targets.LambdaFunction(reviewsLambda));

    // CloudFormation outputs
    new cdk.CfnOutput(this, 'ReviewsBucketName', {
      value: reviewsBucket.bucketName,
      description: 'S3 bucket storing HTML review fragments',
    });

    new cdk.CfnOutput(this, 'ReviewsBucketURL', {
      value: reviewsBucket.bucketWebsiteUrl,
      description: 'Public URL for S3 bucket',
    });

    new cdk.CfnOutput(this, 'MockApiEndpoint', {
      value: mockApi.url,
      description: 'Mock API Gateway endpoint URL',
    });

    new cdk.CfnOutput(this, 'ReviewsLambdaArn', {
      value: reviewsLambda.functionArn,
      description: 'ARN of the reviews processing Lambda',
    });

    new cdk.CfnOutput(this, 'MainPageURL', {
      value: `https://${reviewsBucket.bucketName}.s3.${this.region}.amazonaws.com/index.html`,
      description: 'Main HTML page with ESI includes (for Fastly CDN)',
    });
  }
}

#!/usr/bin/env node
// CDK app entry point that creates the Customer Reviews infrastructure stack.
import * as cdk from 'aws-cdk-lib/core';
import { CustomerReviewsIacStack } from '../lib/customer-reviews-iac-stack';

const app = new cdk.App();

// Get PR number from context (passed via --context prNumber=xxx in Jenkins)
const prNumber = app.node.tryGetContext('prNumber') || 'default';
const stackName = prNumber !== 'default' ? `CustomerReviewsIacStack-${prNumber}` : 'CustomerReviewsIacStack';

new CustomerReviewsIacStack(app, stackName, {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});

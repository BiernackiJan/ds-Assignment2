import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import { Duration } from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

export class EDAAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Table
    const imageTable = new dynamodb.Table(this, "ImageTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "fileName", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "ImagesTable",
    });

    // S3 Bucket
    const imagesBucket = new s3.Bucket(this, "images", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });

    // SQS Queues
    const badImagesQueue = new sqs.Queue(this, "bad-image-queue", {
      retentionPeriod: Duration.minutes(10),
    });

    const imageProcessQueue = new sqs.Queue(this, "img-created-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
    });

    const mailerQ = new sqs.Queue(this, "mailer-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
    });

    const rejectionMailerQ = new sqs.Queue(this, "rejection-mailer-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
    });

    // SNS Topic
    const newImageTopic = new sns.Topic(this, "NewImageTopic", {
      displayName: "New Image topic",
    });

    // Lambda functions
    const processImageFn = new lambdanode.NodejsFunction(
      this,
      "ProcessImageFn",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: `${__dirname}/../lambdas/processImage.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
        deadLetterQueue: mailerQ,
        deadLetterQueueEnabled: true,
        environment: {
          BAD_IMAGES_QUEUE: badImagesQueue.queueUrl,
          IMAGE_TABLE_NAME: imageTable.tableName,
        },
      }
    );

    const updateTableFn = new lambdanode.NodejsFunction(
      this,
      "UpdateTableFunction",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: `${__dirname}/../lambdas/updateTable.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
        environment: {
          IMAGE_TABLE_NAME: imageTable.tableName,
          REGION: this.region,
          BUCKET_NAME: imagesBucket.bucketName,
        },
      }
    );

    const mailerFn = new lambdanode.NodejsFunction(this, "mailer-function", {
      runtime: lambda.Runtime.NODEJS_16_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(3),
      entry: `${__dirname}/../lambdas/mailer.ts`,
    });

    const rejectionMailerFn = new lambdanode.NodejsFunction(
      this,
      "rejectionMailer",
      {
        runtime: lambda.Runtime.NODEJS_16_X,
        memorySize: 1024,
        timeout: cdk.Duration.seconds(3),
        entry: `${__dirname}/../lambdas/rejectionMailer.ts`,
      }
    );

    // S3 Event Notifications for both `OBJECT_CREATED` and `OBJECT_REMOVED`
    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SnsDestination(newImageTopic)
    );

    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_REMOVED,
      new s3n.SnsDestination(newImageTopic)
    );

    // SNS Topic Subscriptions
    newImageTopic.addSubscription(new subs.SqsSubscription(imageProcessQueue));
    newImageTopic.addSubscription(new subs.SqsSubscription(mailerQ));
    newImageTopic.addSubscription(new subs.SqsSubscription(rejectionMailerQ));
    newImageTopic.addSubscription(new subs.SqsSubscription(badImagesQueue));
    newImageTopic.addSubscription(new subs.LambdaSubscription(updateTableFn));

    // SQS Event Sources for Lambda
    const newImageEventSource = new events.SqsEventSource(imageProcessQueue, {
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(5),
    });

    const newImageMailEventSource = new events.SqsEventSource(mailerQ, {
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(5),
    });

    const rejectImageEventSource = new events.SqsEventSource(
      rejectionMailerQ,
      {
        batchSize: 5,
        maxBatchingWindow: cdk.Duration.seconds(5),
      }
    );

    processImageFn.addEventSource(newImageEventSource);
    mailerFn.addEventSource(newImageMailEventSource);
    rejectionMailerFn.addEventSource(rejectImageEventSource);

    // Permissions
    imagesBucket.grantReadWrite(processImageFn);
    badImagesQueue.grantSendMessages(processImageFn);
    imageTable.grantWriteData(processImageFn);
    imageTable.grantWriteData(updateTableFn);


    mailerFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:SendTemplatedEmail",
        ],
        resources: ["*"],
      })
    );

    rejectionMailerFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:SendTemplatedEmail",
        ],
        resources: ["*"],
      })
    );

    // Outputs
    new cdk.CfnOutput(this, "bucketName", {
      value: imagesBucket.bucketName,
    });

    new cdk.CfnOutput(this, "NewImageTopicArn", {
      value: newImageTopic.topicArn,
    });
  }
}

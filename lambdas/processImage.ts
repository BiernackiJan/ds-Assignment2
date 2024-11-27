import { SQSHandler } from "aws-lambda";
import { DynamoDBClient, PutItemCommand, } from "@aws-sdk/client-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";

const region = process.env.REGION!;
const ddbClient = new DynamoDBClient({ region });
const sqsClient = new SQSClient({ region });

const badImagesQueueUrl = process.env.BAD_IMAGES_QUEUE!;
const imageTableName = process.env.IMAGE_TABLE_NAME!;

function isValidImage(fileName: string): boolean {
  const allowedExtensions = [".jpeg", ".jpg", ".png"];
  const fileExtension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  return allowedExtensions.includes(fileExtension);
}

async function saveImageRecord(fileName: string) {
  const params = {
    TableName: imageTableName,
    Item: {
      fileName: { S: fileName },
    },
  };
  await ddbClient.send(new PutItemCommand(params));
  console.log(`Saved image record: ${fileName}`);
}


async function sendToBadImagesQueue(fileName: string, errorMessage: string) {
  const message = {
    fileName,
    errorMessage,
  };

  const params = {
    QueueUrl: badImagesQueueUrl,
    MessageBody: JSON.stringify(message),
  };

  await sqsClient.send(new SendMessageCommand(params));
  console.log(`Sent invalid image to DLQ: ${fileName}`);
}

export const handler: SQSHandler = async (event) => {
  console.log("Processing SQS event", JSON.stringify(event));

  for (const record of event.Records) {
    try {
      const recordBody = JSON.parse(record.body);
      const snsMessage = JSON.parse(recordBody.Message);


      if (snsMessage.Records) {
        for (const messageRecord of snsMessage.Records) {
          const s3e = messageRecord.s3;
          const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));

          if(messageRecord.eventName == "ObjectCreated:Put") {
            if (isValidImage(srcKey)) {
              console.log(`Valid image detected: ${srcKey}`);
              await saveImageRecord(srcKey); // Save to DynamoDB
            } else {
              console.warn(`Invalid image detected: ${srcKey}`);
              await sendToBadImagesQueue(srcKey, "Invalid file type.");
            }
          } else if(messageRecord.eventName == "ObjectRemoved:Delete") {
            console.log(`Deleted image detected: ${srcKey}`);
            await ddbClient.send(
              new DeleteCommand({
                TableName: imageTableName, 
                Key: { fileName: srcKey }, 
              })
            );
          } else {
            console.warn(`Unknown event: ${messageRecord.eventName}`);
          }
        }
      }
    } catch (error) {
      console.error("Error processing record", error);
    }
  }
};

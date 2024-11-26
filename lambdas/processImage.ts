/* eslint-disable import/extensions, import/no-absolute-path */
import { SQSHandler } from "aws-lambda";
import {
  GetObjectCommand,
  GetObjectCommandInput,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  SendMessageCommand, SQSClient,} from "@aws-sdk/client-sqs";

const region = process.env.REGION;
const mailerQueueUrl = process.env.BAD_IMAGES_QUEUE;

const s3 = new S3Client();
const sqs = new SQSClient({ region });

function isValidImage(fileName: string): boolean {
  const allowedExtensions = [".jpeg", ".jpg", ".png"];
  const fileExtension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  return allowedExtensions.includes(fileExtension);
}

export const handler: SQSHandler = async (event) => {
  console.log("Event ", JSON.stringify(event));
  console.log("Mailer Queue URL ", mailerQueueUrl);
  console.log("Mailer Queue URL ", process.env.BAD_IMAGES_QUEUE);


  for (const record of event.Records) {
    try {
      // Parse SQS message
      const recordBody = JSON.parse(record.body);
      const snsMessage = JSON.parse(recordBody.Message);

      if (snsMessage.Records) {
        console.log("Process Image body ", JSON.stringify(snsMessage));

        for (const messageRecord of snsMessage.Records) {
          const s3e = messageRecord.s3;
          const srcBucket = s3e.bucket.name;
          const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));

          if (!isValidImage(srcKey)) {
            // Log the received key and file validation failure
            console.info(`Received file for validation: ${srcKey}`);
            console.warn(`Validation failed for file: ${srcKey}`);
        
            // Send a rejection message to the DLQ for unsupported file types
            const errorMessage = `Invalid file type: ${srcKey}. Only .jpeg and .png files are allowed.`;
            console.error(`Error message: ${errorMessage}`);
        
            try {
                // Log the attempt to send the error message to DLQ
                console.info('Sending error details to DLQ...');
                const message = {
                    fileName: srcKey,
                    errorMessage,
                };
        
                const params = {
                    QueueUrl: mailerQueueUrl,
                    MessageBody: JSON.stringify(message),
                };
        
                const sendMessageCommand = new SendMessageCommand(params);
                await sqs.send(sendMessageCommand);
        
                // Log successful message delivery to DLQ
                console.info(`Error details successfully sent to DLQ for file: ${srcKey}`);
            } catch (error) {
                // Log any errors that occur during the process
                console.error(`Failed to send error details to DLQ for file: ${srcKey}. Error: ${error}`);
            }
        
            // Skip processing for invalid files
            continue;
        }
        

          // try {
          //   // Attempt to download the image from the S3 source bucket
          //   const params: GetObjectCommandInput = {
          //     Bucket: srcBucket,
          //     Key: srcKey,
          //   };
          //   const origimage = await s3.send(new GetObjectCommand(params));
          //   console.log(`Successfully retrieved image: ${srcKey}`);
          //   // Process the image (e.g., resize, analyze, etc.)...

          // } catch (error: unknown) {
          //   console.error(`Error processing file ${srcKey}:`, error);

          //   // Send a rejection message to the DLQ for processing errors
          //   const rejectionMessage: SendMessageCommandInput = {
          //     QueueUrl: process.env.IMAGE_PROCESS_DLQ_URL!,
          //     MessageBody: JSON.stringify({
          //       fileName: srcKey,
          //       errorMessage: `Error processing image: ${
          //         error instanceof Error ? error.message : "Unknown error"
          //       }`,
          //     }),
          //   };
          //   await sqs.send(new SendMessageCommand(rejectionMessage));
          // }
        }
      }
    } catch (error: unknown) {
      console.error("Error processing SQS message:", error);
    }
  }
};

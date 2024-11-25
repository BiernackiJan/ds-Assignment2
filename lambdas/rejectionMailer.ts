import { SQSHandler } from "aws-lambda";
import {
  SESClient,
  SendEmailCommand,
  SendEmailCommandInput,
} from "@aws-sdk/client-ses";

const ses = new SESClient({ region: process.env.SES_REGION });

export const handler: SQSHandler = async (event) => {
  for (const record of event.Records) {
    const body = JSON.parse(record.body);
    const errorMessage = body.MessageAttributes?.ErrorMessage?.StringValue;

    const fileName = body.MessageAttributes?.FileName?.StringValue || "unknown file";

    const params: SendEmailCommandInput = {
      Destination: {
        ToAddresses: [process.env.SES_EMAIL_TO!],
      },
      Message: {
        Body: {
          Text: {
            Data: `The upload of file "${fileName}" was rejected. Reason: ${errorMessage}`,
          },
        },
        Subject: {
          Data: "File Upload Rejection",
        },
      },
      Source: process.env.SES_EMAIL_FROM!,
    };

    try {
      await ses.send(new SendEmailCommand(params));
      console.log(`Rejection email sent for file: ${fileName}`);
    } catch (error) {
      console.error(`Failed to send rejection email: ${error}`);
    }
  }
};
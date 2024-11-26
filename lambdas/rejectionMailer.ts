import { SQSHandler } from "aws-lambda";
import { SES_EMAIL_FROM, SES_EMAIL_TO, SES_REGION } from "../env";
import {
  SESClient,
  SendEmailCommand,
  SendEmailCommandInput,
} from "@aws-sdk/client-ses";

if (!SES_EMAIL_TO || !SES_EMAIL_FROM || !SES_REGION) {
  throw new Error(
    "Please add the SES_EMAIL_TO, SES_EMAIL_FROM, and SES_REGION environment variables in an env.js file."
  );
}

const client = new SESClient({ region: SES_REGION });

export const handler: SQSHandler = async (event) => {
  console.log("Rejection Mailer Event", JSON.stringify(event));

  for (const record of event.Records) {
    try {
      const recordBody = JSON.parse(record.body);
      const { fileName, rejectionReason } = recordBody;

      console.log(`Processing rejection for file: ${fileName}`);

      // Construct email parameters
      const params = sendEmailParams({
        name: "The Photo Album",
        email: SES_EMAIL_FROM,
        message: `The file "${fileName}" was rejected: ${rejectionReason || 'Invalid file type.'}`,
      });

      // Send email via SES
      await client.send(new SendEmailCommand(params));
      console.log(`Rejection email sent for ${fileName}`);
    } catch (error) {
      console.error("Failed to process rejection mailer event", error);
    }
  }
};

function sendEmailParams({ name, email, message }: { name: string; email: string; message: string }) {
  return {
    Destination: {
      ToAddresses: [SES_EMAIL_TO],
    },
    Message: {
      Body: {
        Html: {
          Charset: "UTF-8",
          Data: getHtmlContent({ name, email, message }),
        },
      },
      Subject: {
        Charset: "UTF-8",
        Data: `Image Rejection Notification`,
      },
    },
    Source: SES_EMAIL_FROM,
  } as SendEmailCommandInput;
}

function getHtmlContent({ name, email, message }: { name: string; email: string; message: string }) {
  return `
    <html>
      <body>
        <h2>File Rejection Notice</h2>
        <p>Hello,</p>
        <p>${message}</p>
        <p>Best regards,</p>
        <p>${name}</p>
        <p><i>Sent from: ${email}</i></p>
      </body>
    </html>
  `;
}
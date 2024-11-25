import { SQSHandler } from "aws-lambda";
import { BadImage } from './../shared/types'

export const handler: SQSHandler = async (event) => {
  try {
    console.log("Event: ", JSON.stringify(event));
    for (const record of event.Records) {
      const message : BadImage = JSON.parse(record.body) as BadImage
      console.log(message);
    }
  } catch (error) {
    console.log(JSON.stringify(error));
  }
};
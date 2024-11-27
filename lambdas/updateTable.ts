import { SNSHandler } from "aws-lambda";
import { DynamoDBClient, UpdateItemCommand, ReturnValue } from "@aws-sdk/client-dynamodb";

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const tableName = process.env.IMAGE_TABLE_NAME;

const VALID_METADATA_TYPES = ["Caption", "Date", "Photographer"];

export const handler: SNSHandler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    try {
      // Parse the SNS message
      const message = JSON.parse(record.Sns.Message);
      const attributes = record.Sns.MessageAttributes;

      // Extract fields from the message
      const id = message.id;
      const value = message.value;
      const date = message.date;
      const name = message.name;
      const metadataType = attributes?.metadata_type?.Value;

      if (!id || !value || !date || !name || !metadataType) {
        throw new Error("Invalid message format: 'id', 'value', 'date', 'name', and 'metadata_type' are required.");
      }

      // Validate metadata type
      if (!VALID_METADATA_TYPES.includes(metadataType)) {
        throw new Error(`Invalid metadata_type: '${metadataType}'. Valid types are: ${VALID_METADATA_TYPES.join(", ")}`);
      }

      console.log(`Updating item: ${id} with metadata: ${metadataType}=${value}, date=${date}, name=${name}`);

      // Update the DynamoDB item
      await updateMetadataInTable(id, value, date, name);

      console.log(`Successfully updated metadata for ${id}`);
    } catch (error) {
      console.error("Error processing record:", error);
    }
  }
};

async function updateMetadataInTable(id: string, value: string, date: string, name: string) {
  const updateExpression = `SET #caption = :value, #addedDate = :date, #photographerName = :name`;

  const params = {
    TableName: tableName,
    Key: {
      fileName: { S: id }, 
    },
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: {
      "#caption": "Caption",
      "#addedDate": "Date",
      "#photographerName": "PhotographerName",
    },
    ExpressionAttributeValues: {
      ":value": { S: value },
      ":date": { S: date },
      ":name": { S: name },
    },
    ReturnValues: ReturnValue.UPDATED_NEW,
  };

  console.log("Update parameters:", JSON.stringify(params, null, 2));

  try {
    const result = await ddbClient.send(new UpdateItemCommand(params));
    console.log(`Successfully updated metadata for ID: ${id}`);
    console.log("Update result:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error updating metadata in DynamoDB:", error);
    throw error; 
  }
}
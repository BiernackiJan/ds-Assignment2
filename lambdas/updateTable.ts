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
      "#caption": "Caption",            // Attribute name alias for "Caption"
      "#addedDate": "Date",        // Attribute name alias for "Date"
      "#photographerName": "PhotographerName",  // Attribute name alias for "PhotographerName"
    },
    ExpressionAttributeValues: {
      ":value": { S: value },           // Actual value for Caption
      ":date": { S: date },             // Actual value for Date
      ":name": { S: name },             // Actual value for PhotographerName
    },
    ReturnValues: ReturnValue.UPDATED_NEW,  // Correct use of the enum here
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

// import { SNSHandler } from "aws-lambda";
// import { DynamoDBClient, UpdateItemCommand, DeleteItemCommand, ReturnValue } from "@aws-sdk/client-dynamodb";  // Import ReturnValue enum
// import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

// const ddbClient = new DynamoDBClient({ region: process.env.REGION });
// const s3Client = new S3Client({ region: process.env.REGION });
// const tableName = process.env.IMAGE_TABLE_NAME;
// const bucketName = process.env.BUCKET_NAME;

// const VALID_METADATA_TYPES = ["Caption", "Date", "Photographer"];

// export const handler: SNSHandler = async (event) => {
//   console.log("Received event:", JSON.stringify(event, null, 2));

//   for (const record of event.Records) {
//     try {
//       // Parse the SNS message
//       const message = JSON.parse(record.Sns.Message);
//       const attributes = record.Sns.MessageAttributes;

//       // Extract fields from the message
//       const id = message.id;
//       const value = message.value;
//       const date = message.date;
//       const name = message.name;
//       const metadataType = attributes?.metadata_type?.Value;

//       if (!id || !value || !date || !name || !metadataType) {
//         throw new Error("Invalid message format: 'id', 'value', 'date', 'name', and 'metadata_type' are required.");
//       }

//       // Validate metadata type
//       if (!VALID_METADATA_TYPES.includes(metadataType)) {
//         throw new Error(`Invalid metadata_type: '${metadataType}'. Valid types are: ${VALID_METADATA_TYPES.join(", ")}`);
//       }

//       console.log(`Processing metadata for item: ${id}`);
//       console.log(`Checking message ` + JSON.stringify(message));

//       if (message.action && message.action === "delete") {
//         console.log(`Checking message ` + JSON.stringify(message));
//         // If delete flag is set in the message, delete from both S3 and DynamoDB
//         await deleteImageFromS3(id); // Delete image from S3
//         await deleteMetadataFromDynamoDB(id); // Delete metadata from DynamoDB
//       } else {
//         // Otherwise, update metadata in DynamoDB
//         await updateMetadataInTable(id, value, date, name);
//       }

//     } catch (error) {
//       console.error("Error processing record:", error);
//     }
//   }
// };

// // Delete image from S3
// async function deleteImageFromS3(id: string) {
//   if (!bucketName) {
//     throw new Error("BUCKET_NAME environment variable must be set.");
//   }

//   const deleteParams = {
//     Bucket: bucketName,
//     Key: id, // Assuming the S3 key is the same as the ID
//   };

//   try {
//     await s3Client.send(new DeleteObjectCommand(deleteParams));
//     console.log(`Successfully deleted image from S3 with key: ${id}`);
//   } catch (error) {
//     console.error(`Error deleting image from S3 with key: ${id}`, error);
//     throw error;
//   }
// }

// // Delete metadata from DynamoDB
// async function deleteMetadataFromDynamoDB(id: string) {
//   const deleteParams = {
//     TableName: tableName,
//     Key: {
//       fileName: { S: id }, // Use the same ID to delete the metadata entry
//     },
//   };

//   try {
//     await ddbClient.send(new DeleteItemCommand(deleteParams));
//     console.log(`Successfully deleted metadata for ${id} from DynamoDB`);
//   } catch (error) {
//     console.error("Error deleting metadata from DynamoDB:", error);
//     throw error;
//   }
// }

// // Update metadata in DynamoDB
// async function updateMetadataInTable(id: string, value: string, date: string, name: string) {
//   const updateExpression = `SET #caption = :value, #addedDate = :date, #photographerName = :name`;

//   const params = {
//     TableName: tableName,
//     Key: {
//       fileName: { S: id }, // The unique identifier of the item to update
//     },
//     UpdateExpression: updateExpression,
//     ExpressionAttributeNames: {
//       "#caption": "Caption",            // Attribute name alias for "Caption"
//       "#addedDate": "Date",             // Attribute name alias for "Date"
//       "#photographerName": "PhotographerName",  // Attribute name alias for "PhotographerName"
//     },
//     ExpressionAttributeValues: {
//       ":value": { S: value },           // Actual value for Caption
//       ":date": { S: date },             // Actual value for Date
//       ":name": { S: name },             // Actual value for PhotographerName
//     },
//     ReturnValues: ReturnValue.UPDATED_NEW,  // Correct use of ReturnValue enum here
//   };

//   // Log the parameters to verify the values
//   console.log("Update parameters:", JSON.stringify(params, null, 2));

//   try {
//     // Send the update command to DynamoDB
//     const result = await ddbClient.send(new UpdateItemCommand(params));
//     console.log("Successfully updated metadata for ID:", id);
//     console.log("Update result:", JSON.stringify(result, null, 2));
//   } catch (error) {
//     console.error("Error updating metadata in DynamoDB:", error);
//     throw error; // Rethrow the error to be handled by the caller
//   }
// }

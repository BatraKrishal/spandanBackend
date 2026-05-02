import { google } from "googleapis";

// Format name to title case
const toTitleCase = (str: string) => {
  if (!str) return "";
  return str.replace(
    /\w\S*/g,
    (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
};

const eventMaxTeamSize: Record<string, number> = {
  "GreenHack: Code for Impact": 6,
  "AlgoRhythm": 1,
  "AI Foresight": 4,
  "BridgeIt": 6,
  "TechScape Hunt": 5,
  "GeoCraft Arena": 6,
  "NetRunnerz": 6,
  "EcoInnovate": 8,
  "DesignForge": 1,
  "Circuit Chase": 6,
  "WALL-E": 10,
  "Wiki Run": 1,
  "AbsurdUx": 3,
  "ElectroManiac": 4,
};

export const appendRegistrationToSheet = async (
  eventName: string,
  participant: any
) => {
  try {
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    const credentialsBase64 = process.env.GOOGLE_SHEETS_CREDENTIALS;

    if (!spreadsheetId || !credentialsBase64) {
      console.warn("Google Sheets credentials or Spreadsheet ID not found in environment variables. Skipping Sheets integration.");
      return;
    }

    // Parse credentials
    let credentials;
    try {
      // Decode base64 to allow easy environment variable storage without multi-line escaping issues
      const decoded = Buffer.from(credentialsBase64, 'base64').toString('utf8');
      credentials = JSON.parse(decoded);
    } catch (e) {
       console.error("Failed to parse Google Sheets credentials. Ensure GOOGLE_SHEETS_CREDENTIALS is a base64 encoded JSON string:", e);
       return;
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    // Format eventName to be a safe sheet name
    const sheetName = eventName.trim();

    // 1. Check if the sheet exists, if not create it
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
    });
    
    const sheetExists = spreadsheet.data.sheets?.some(
      (s) => s.properties?.title === sheetName
    );

    if (!sheetExists) {
      // Create new sheet
      const addSheetResponse = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            },
          ],
        },
      });

      const newSheetId = addSheetResponse.data.replies?.[0]?.addSheet?.properties?.sheetId;

      // Add headers to the new sheet
      const maxMembers = (eventMaxTeamSize[eventName] || 5) - 1; // subtract 1 for Leader
      const headers = [
        "Leader Name",
        "Leader Branch",
        "Leader College",
        "Leader Email",
      ];
      for (let i = 1; i <= maxMembers; i++) {
        headers.push(`Member ${i} Name`);
        headers.push(`Member ${i} Branch`);
        headers.push(`Member ${i} College`);
      }

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [headers],
        },
      });

      // Make headers bold
      if (newSheetId !== undefined) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                repeatCell: {
                  range: {
                    sheetId: newSheetId,
                    startRowIndex: 0,
                    endRowIndex: 1,
                  },
                  cell: {
                    userEnteredFormat: {
                      textFormat: {
                        bold: true,
                      },
                    },
                  },
                  fields: "userEnteredFormat.textFormat.bold",
                },
              },
            ],
          },
        });
      }
    }

    // 2. Prepare the row data
    const row = [
      toTitleCase(participant.name),
      participant.branch,
      participant.college,
      participant.email,
    ];

    if (participant.teamMembers && Array.isArray(participant.teamMembers)) {
      participant.teamMembers.forEach((member: any) => {
        row.push(toTitleCase(member.name));
        row.push(member.branch);
        row.push(member.college);
      });
    }

    // 3. Append the row
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [row],
      },
    });

    console.log(`Successfully appended registration for ${participant.name} to sheet ${sheetName}`);
  } catch (error) {
    console.error("Error appending to Google Sheets:", error);
    // We don't want to throw and fail the registration if Google Sheets fails, just log it.
  }
};

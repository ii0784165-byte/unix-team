/**
 * Google Integration Service
 * Handles Google Docs, Sheets, and Drive integration
 */

const { google } = require('googleapis');
const { PrismaClient } = require('@prisma/client');
const encryptionService = require('./encryption.service');
const { logger } = require('../config/logger');

const prisma = new PrismaClient();

class GoogleService {
  constructor() {
    this.scopes = [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/documents.readonly',
      'https://www.googleapis.com/auth/spreadsheets.readonly'
    ];
  }

  /**
   * Get OAuth2 client for a user
   */
  async _getOAuth2Client(userId) {
    const connection = await prisma.oAuthConnection.findFirst({
      where: { userId, provider: 'google' }
    });

    if (!connection) {
      throw new Error('Google account not connected');
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_CALLBACK_URL
    );

    const accessToken = encryptionService.decrypt(connection.accessToken);
    const refreshToken = connection.refreshToken 
      ? encryptionService.decrypt(connection.refreshToken)
      : null;

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken
    });

    // Handle token refresh
    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        await prisma.oAuthConnection.update({
          where: { id: connection.id },
          data: {
            accessToken: encryptionService.encrypt(tokens.access_token),
            refreshToken: tokens.refresh_token 
              ? encryptionService.encrypt(tokens.refresh_token)
              : connection.refreshToken
          }
        });
      }
    });

    return oauth2Client;
  }

  /**
   * List files from Google Drive
   */
  async listDriveFiles(userId, options = {}) {
    try {
      const auth = await this._getOAuth2Client(userId);
      const drive = google.drive({ version: 'v3', auth });

      const { pageSize = 20, pageToken, mimeType, folderId } = options;

      let query = 'trashed = false';
      
      if (mimeType) {
        query += ` and mimeType = '${mimeType}'`;
      }
      
      if (folderId) {
        query += ` and '${folderId}' in parents`;
      }

      const response = await drive.files.list({
        pageSize,
        pageToken,
        q: query,
        fields: 'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, thumbnailLink, owners)'
      });

      return {
        files: response.data.files,
        nextPageToken: response.data.nextPageToken
      };
    } catch (error) {
      logger.error('Failed to list Drive files:', error);
      throw new Error('Failed to access Google Drive: ' + error.message);
    }
  }

  /**
   * Get Google Docs content
   */
  async getDocument(userId, documentId) {
    try {
      const auth = await this._getOAuth2Client(userId);
      const docs = google.docs({ version: 'v1', auth });

      const response = await docs.documents.get({
        documentId
      });

      const document = response.data;

      // Extract text content
      const textContent = this._extractDocumentText(document.body.content);

      return {
        id: document.documentId,
        title: document.title,
        textContent,
        lastModified: document.revisionId
      };
    } catch (error) {
      logger.error('Failed to get Google Doc:', error);
      throw new Error('Failed to access Google Doc: ' + error.message);
    }
  }

  /**
   * Get Google Sheets data
   */
  async getSpreadsheet(userId, spreadsheetId, range = 'Sheet1') {
    try {
      const auth = await this._getOAuth2Client(userId);
      const sheets = google.sheets({ version: 'v4', auth });

      // Get spreadsheet metadata
      const metadata = await sheets.spreadsheets.get({
        spreadsheetId
      });

      // Get data from specified range
      const data = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range
      });

      const rows = data.data.values || [];
      const headers = rows[0] || [];
      
      // Convert to array of objects
      const records = rows.slice(1).map(row => {
        const record = {};
        headers.forEach((header, index) => {
          record[header] = row[index] || '';
        });
        return record;
      });

      return {
        id: spreadsheetId,
        title: metadata.data.properties.title,
        sheets: metadata.data.sheets.map(s => s.properties.title),
        headers,
        records,
        rowCount: records.length
      };
    } catch (error) {
      logger.error('Failed to get Google Sheet:', error);
      throw new Error('Failed to access Google Sheet: ' + error.message);
    }
  }

  /**
   * Sync Google Doc to local database
   */
  async syncDocument(userId, documentId, teamId = null, projectId = null) {
    try {
      const docData = await this.getDocument(userId, documentId);

      // Create or update document record
      const document = await prisma.document.upsert({
        where: {
          // Find by Google Doc ID
          id: await this._findDocumentBySourceId(documentId) || 'new-doc'
        },
        create: {
          teamId,
          projectId,
          name: docData.title,
          type: 'DOCUMENT',
          sourceType: 'GOOGLE_DOCS',
          sourceId: documentId,
          sourceUrl: `https://docs.google.com/document/d/${documentId}`,
          lastSyncAt: new Date(),
          createdBy: userId
        },
        update: {
          name: docData.title,
          lastSyncAt: new Date()
        }
      });

      logger.info(`Synced Google Doc: ${docData.title}`);

      return {
        document,
        content: docData.textContent
      };
    } catch (error) {
      logger.error('Failed to sync Google Doc:', error);
      throw new Error('Sync failed: ' + error.message);
    }
  }

  /**
   * Sync Google Sheet to local database
   */
  async syncSpreadsheet(userId, spreadsheetId, teamId = null, projectId = null) {
    try {
      const sheetData = await this.getSpreadsheet(userId, spreadsheetId);

      const document = await prisma.document.upsert({
        where: {
          id: await this._findDocumentBySourceId(spreadsheetId) || 'new-sheet'
        },
        create: {
          teamId,
          projectId,
          name: sheetData.title,
          type: 'SPREADSHEET',
          sourceType: 'GOOGLE_SHEETS',
          sourceId: spreadsheetId,
          sourceUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
          lastSyncAt: new Date(),
          createdBy: userId
        },
        update: {
          name: sheetData.title,
          lastSyncAt: new Date()
        }
      });

      logger.info(`Synced Google Sheet: ${sheetData.title} (${sheetData.rowCount} rows)`);

      return {
        document,
        data: sheetData.records,
        headers: sheetData.headers
      };
    } catch (error) {
      logger.error('Failed to sync Google Sheet:', error);
      throw new Error('Sync failed: ' + error.message);
    }
  }

  /**
   * Import team data from Google Sheet
   */
  async importTeamsFromSheet(userId, spreadsheetId, range = 'Teams') {
    const sheetData = await this.getSpreadsheet(userId, spreadsheetId, range);

    const results = {
      teamsCreated: 0,
      membersAdded: 0,
      errors: []
    };

    // Group by team
    const teamMap = new Map();
    for (const row of sheetData.records) {
      const teamName = row['Team Name'] || row['team_name'] || row['Team'];
      if (!teamName) continue;

      if (!teamMap.has(teamName)) {
        teamMap.set(teamName, {
          name: teamName,
          description: row['Description'] || row['team_description'] || '',
          department: row['Department'] || row['department'] || '',
          members: []
        });
      }

      const email = row['Email'] || row['email'];
      if (email) {
        teamMap.get(teamName).members.push({
          email,
          role: row['Role'] || row['role'] || 'MEMBER'
        });
      }
    }

    // Create teams and members
    for (const [teamName, teamData] of teamMap) {
      try {
        let team = await prisma.team.findFirst({
          where: { name: teamData.name }
        });

        if (!team) {
          team = await prisma.team.create({
            data: {
              name: teamData.name,
              description: teamData.description,
              department: teamData.department
            }
          });
          results.teamsCreated++;
        }

        for (const memberData of teamData.members) {
          try {
            const user = await prisma.user.findUnique({
              where: { email: memberData.email }
            });

            if (user) {
              const roleMap = {
                'owner': 'OWNER',
                'lead': 'LEAD',
                'member': 'MEMBER',
                'viewer': 'VIEWER'
              };

              await prisma.teamMember.upsert({
                where: {
                  teamId_userId: { teamId: team.id, userId: user.id }
                },
                create: {
                  teamId: team.id,
                  userId: user.id,
                  role: roleMap[memberData.role.toLowerCase()] || 'MEMBER'
                },
                update: {}
              });
              results.membersAdded++;
            }
          } catch (err) {
            results.errors.push(`Member ${memberData.email}: ${err.message}`);
          }
        }
      } catch (err) {
        results.errors.push(`Team ${teamName}: ${err.message}`);
      }
    }

    logger.info(`Google Sheet import: ${results.teamsCreated} teams, ${results.membersAdded} members`);
    return results;
  }

  // Private helper methods

  _extractDocumentText(content) {
    let text = '';

    for (const element of content) {
      if (element.paragraph) {
        for (const elem of element.paragraph.elements) {
          if (elem.textRun) {
            text += elem.textRun.content;
          }
        }
      } else if (element.table) {
        for (const row of element.table.tableRows) {
          for (const cell of row.tableCells) {
            text += this._extractDocumentText(cell.content);
          }
        }
      }
    }

    return text;
  }

  async _findDocumentBySourceId(sourceId) {
    const doc = await prisma.document.findFirst({
      where: { sourceId },
      select: { id: true }
    });
    return doc?.id;
  }
}

module.exports = new GoogleService();

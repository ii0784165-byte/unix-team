/**
 * Excel Integration Service
 * Handles Excel file operations and data synchronization
 */

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs').promises;
const { PrismaClient } = require('@prisma/client');
const encryptionService = require('./encryption.service');
const { logger } = require('../config/logger');

const prisma = new PrismaClient();

class ExcelService {
  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR || './uploads';
    this.maxFileSize = (parseInt(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024;
  }

  /**
   * Import data from Excel file
   */
  async importExcel(filePath, options = {}) {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);

      const { sheetName, headerRow = 1 } = options;
      
      const worksheet = sheetName 
        ? workbook.getWorksheet(sheetName)
        : workbook.worksheets[0];

      if (!worksheet) {
        throw new Error('Worksheet not found');
      }

      // Get headers from specified row
      const headers = [];
      worksheet.getRow(headerRow).eachCell((cell, colNumber) => {
        headers[colNumber] = cell.value?.toString().trim();
      });

      // Parse data rows
      const data = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRow) return;

        const rowData = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber];
          if (header) {
            rowData[header] = this._getCellValue(cell);
          }
        });

        if (Object.keys(rowData).length > 0) {
          data.push(rowData);
        }
      });

      logger.info(`Imported ${data.length} rows from Excel file`);
      return {
        headers,
        data,
        rowCount: data.length,
        sheetName: worksheet.name
      };
    } catch (error) {
      logger.error('Excel import failed:', error);
      throw new Error('Failed to import Excel file: ' + error.message);
    }
  }

  /**
   * Export data to Excel file
   */
  async exportToExcel(data, options = {}) {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Unix Team Platform';
      workbook.created = new Date();

      const {
        sheetName = 'Data',
        headers,
        styling = true,
        fileName = `export_${Date.now()}.xlsx`
      } = options;

      const worksheet = workbook.addWorksheet(sheetName);

      // Determine headers from data if not provided
      const columnHeaders = headers || (data.length > 0 ? Object.keys(data[0]) : []);

      // Add header row
      worksheet.columns = columnHeaders.map(header => ({
        header,
        key: header,
        width: 15
      }));

      // Style header row
      if (styling) {
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF2563EB' }
        };
        worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
      }

      // Add data rows
      data.forEach(row => {
        worksheet.addRow(row);
      });

      // Auto-fit columns
      worksheet.columns.forEach(column => {
        let maxLength = 15;
        column.eachCell({ includeEmpty: true }, cell => {
          const cellLength = cell.value ? cell.value.toString().length : 10;
          maxLength = Math.max(maxLength, Math.min(cellLength + 2, 50));
        });
        column.width = maxLength;
      });

      const filePath = path.join(this.uploadDir, 'exports', fileName);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await workbook.xlsx.writeFile(filePath);

      logger.info(`Exported ${data.length} rows to Excel file: ${fileName}`);
      return {
        filePath,
        fileName,
        rowCount: data.length
      };
    } catch (error) {
      logger.error('Excel export failed:', error);
      throw new Error('Failed to export to Excel: ' + error.message);
    }
  }

  /**
   * Import teams and members from Excel
   */
  async importTeamsFromExcel(filePath, createdBy) {
    const { data } = await this.importExcel(filePath, { headerRow: 1 });

    const results = {
      teamsCreated: 0,
      membersAdded: 0,
      errors: []
    };

    // Group by team
    const teamMap = new Map();
    for (const row of data) {
      const teamName = row.team_name || row.Team || row.TeamName;
      if (!teamName) continue;

      if (!teamMap.has(teamName)) {
        teamMap.set(teamName, {
          name: teamName,
          description: row.team_description || row.Description || '',
          department: row.department || row.Department || '',
          members: []
        });
      }

      if (row.email || row.Email) {
        teamMap.get(teamName).members.push({
          email: row.email || row.Email,
          role: row.role || row.Role || 'MEMBER'
        });
      }
    }

    // Create teams and add members
    for (const [teamName, teamData] of teamMap) {
      try {
        // Create or find team
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

        // Add members
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
          } catch (memberError) {
            results.errors.push(`Failed to add member ${memberData.email}: ${memberError.message}`);
          }
        }
      } catch (teamError) {
        results.errors.push(`Failed to create team ${teamName}: ${teamError.message}`);
      }
    }

    logger.info(`Excel import complete: ${results.teamsCreated} teams, ${results.membersAdded} members`);
    return results;
  }

  /**
   * Export teams data to Excel
   */
  async exportTeamsToExcel(filters = {}) {
    const teams = await prisma.team.findMany({
      where: { isActive: true, deletedAt: null, ...filters },
      include: {
        members: {
          where: { leftAt: null },
          include: {
            user: {
              select: { firstName: true, lastName: true, email: true }
            }
          }
        },
        projects: {
          where: { deletedAt: null },
          select: { name: true, status: true }
        }
      }
    });

    const data = [];
    for (const team of teams) {
      for (const member of team.members) {
        data.push({
          'Team Name': team.name,
          'Department': team.department || '',
          'Member Name': `${member.user.firstName} ${member.user.lastName}`,
          'Email': member.user.email,
          'Role': member.role,
          'Project Count': team.projects.length,
          'Active Projects': team.projects.filter(p => p.status === 'IN_PROGRESS').length
        });
      }
    }

    return this.exportToExcel(data, {
      sheetName: 'Teams',
      fileName: `teams_export_${Date.now()}.xlsx`
    });
  }

  /**
   * Export project data to Excel
   */
  async exportProjectsToExcel(filters = {}) {
    const projects = await prisma.project.findMany({
      where: { deletedAt: null, ...filters },
      include: {
        team: { select: { name: true, department: true } },
        githubRepos: true,
        aiAnalyses: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    const data = projects.map(project => ({
      'Project Name': project.name,
      'Team': project.team?.name || '',
      'Department': project.team?.department || '',
      'Status': project.status,
      'Technologies': project.technologies?.join(', ') || '',
      'Start Date': project.startDate?.toISOString().split('T')[0] || '',
      'End Date': project.endDate?.toISOString().split('T')[0] || '',
      'GitHub Repos': project.githubRepos?.length || 0,
      'AI Usefulness Score': project.aiAnalyses[0]?.usefulnessScore || '',
      'Description': project.description || ''
    }));

    return this.exportToExcel(data, {
      sheetName: 'Projects',
      fileName: `projects_export_${Date.now()}.xlsx`
    });
  }

  // Private helper methods

  _getCellValue(cell) {
    if (cell.type === ExcelJS.ValueType.Date) {
      return cell.value.toISOString();
    }
    if (cell.type === ExcelJS.ValueType.RichText) {
      return cell.value.richText.map(rt => rt.text).join('');
    }
    if (cell.type === ExcelJS.ValueType.Hyperlink) {
      return cell.value.hyperlink || cell.value.text;
    }
    if (cell.type === ExcelJS.ValueType.Formula) {
      return cell.result;
    }
    return cell.value;
  }
}

module.exports = new ExcelService();

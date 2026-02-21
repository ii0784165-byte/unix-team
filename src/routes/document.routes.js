/**
 * Document Routes
 * Document management, Excel and Google Docs integration
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const path = require('path');
const { authenticate, requirePermission } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { logAction } = require('../middleware/audit');
const { AUDIT_ACTIONS } = require('../services/audit.service');
const excelService = require('../services/excel.service');
const googleService = require('../services/google.service');

const router = express.Router();
const prisma = new PrismaClient();

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || './uploads');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/pdf',
      'text/csv'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  }
});

// ============================================
// DOCUMENT CRUD
// ============================================

/**
 * GET /documents
 * List documents
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, teamId, projectId, type, sourceType } = req.query;
  const skip = (page - 1) * limit;

  const where = { deletedAt: null };
  
  if (teamId) where.teamId = teamId;
  if (projectId) where.projectId = projectId;
  if (type) where.type = type;
  if (sourceType) where.sourceType = sourceType;

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      include: {
        team: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      },
      skip,
      take: parseInt(limit),
      orderBy: { updatedAt: 'desc' }
    }),
    prisma.document.count({ where })
  ]);

  res.json({
    success: true,
    data: {
      documents,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
}));

/**
 * GET /documents/:documentId
 * Get document details
 */
router.get('/:documentId', authenticate, [
  param('documentId').isUUID()
], asyncHandler(async (req, res) => {
  const document = await prisma.document.findUnique({
    where: { id: req.params.documentId },
    include: {
      team: true,
      project: true,
      versions: {
        orderBy: { version: 'desc' },
        take: 10
      }
    }
  });

  if (!document) {
    return res.status(404).json({ success: false, error: 'Document not found' });
  }

  res.json({
    success: true,
    data: { document }
  });
}));

// ============================================
// EXCEL OPERATIONS
// ============================================

/**
 * POST /documents/excel/upload
 * Upload and import Excel file
 */
router.post('/excel/upload', authenticate, requirePermission('documents:write'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { teamId, projectId, sheetName } = req.body;

    // Import Excel data
    const importResult = await excelService.importExcel(req.file.path, { sheetName });

    // Create document record
    const document = await prisma.document.create({
      data: {
        teamId: teamId || null,
        projectId: projectId || null,
        name: req.file.originalname,
        type: 'SPREADSHEET',
        sourceType: 'EXCEL_LOCAL',
        mimeType: req.file.mimetype,
        size: req.file.size,
        encryptedPath: req.file.path,
        createdBy: req.user.userId
      }
    });

    await logAction(req, AUDIT_ACTIONS.DOCUMENT_CREATED, 'Document', document.id, {
      fileName: req.file.originalname,
      rows: importResult.rowCount
    });

    res.status(201).json({
      success: true,
      data: {
        document,
        import: {
          headers: importResult.headers,
          rowCount: importResult.rowCount,
          preview: importResult.data.slice(0, 5)
        }
      }
    });
  })
);

/**
 * POST /documents/excel/import-teams
 * Import teams from Excel
 */
router.post('/excel/import-teams', authenticate, requirePermission('teams:write'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const result = await excelService.importTeamsFromExcel(req.file.path, req.user.userId);

    res.json({
      success: true,
      data: result
    });
  })
);

/**
 * GET /documents/excel/export/teams
 * Export teams to Excel
 */
router.get('/excel/export/teams', authenticate, requirePermission('documents:export'),
  asyncHandler(async (req, res) => {
    const result = await excelService.exportTeamsToExcel();

    await logAction(req, AUDIT_ACTIONS.DOCUMENT_EXPORTED, 'Export', null, {
      type: 'teams',
      rows: result.rowCount
    });

    res.download(result.filePath, result.fileName);
  })
);

/**
 * GET /documents/excel/export/projects
 * Export projects to Excel
 */
router.get('/excel/export/projects', authenticate, requirePermission('documents:export'),
  asyncHandler(async (req, res) => {
    const { teamId, status } = req.query;
    const filters = {};
    if (teamId) filters.teamId = teamId;
    if (status) filters.status = status;

    const result = await excelService.exportProjectsToExcel(filters);

    await logAction(req, AUDIT_ACTIONS.DOCUMENT_EXPORTED, 'Export', null, {
      type: 'projects',
      rows: result.rowCount
    });

    res.download(result.filePath, result.fileName);
  })
);

// ============================================
// GOOGLE DOCS/SHEETS OPERATIONS
// ============================================

/**
 * GET /documents/google/drive
 * List Google Drive files
 */
router.get('/google/drive', authenticate, asyncHandler(async (req, res) => {
  const { pageSize, pageToken, mimeType, folderId } = req.query;

  const result = await googleService.listDriveFiles(req.user.userId, {
    pageSize: parseInt(pageSize) || 20,
    pageToken,
    mimeType,
    folderId
  });

  res.json({
    success: true,
    data: result
  });
}));

/**
 * GET /documents/google/docs/:documentId
 * Get Google Doc content
 */
router.get('/google/docs/:documentId', authenticate, asyncHandler(async (req, res) => {
  const result = await googleService.getDocument(req.user.userId, req.params.documentId);

  res.json({
    success: true,
    data: result
  });
}));

/**
 * GET /documents/google/sheets/:spreadsheetId
 * Get Google Sheet data
 */
router.get('/google/sheets/:spreadsheetId', authenticate, asyncHandler(async (req, res) => {
  const { range } = req.query;
  
  const result = await googleService.getSpreadsheet(
    req.user.userId,
    req.params.spreadsheetId,
    range || 'Sheet1'
  );

  res.json({
    success: true,
    data: result
  });
}));

/**
 * POST /documents/google/sync/doc
 * Sync Google Doc
 */
router.post('/google/sync/doc', authenticate, requirePermission('documents:write'), [
  body('documentId').notEmpty(),
  body('teamId').optional().isUUID(),
  body('projectId').optional().isUUID()
], asyncHandler(async (req, res) => {
  const { documentId, teamId, projectId } = req.body;

  const result = await googleService.syncDocument(
    req.user.userId,
    documentId,
    teamId,
    projectId
  );

  await logAction(req, AUDIT_ACTIONS.DOCUMENT_SYNCED, 'Document', result.document.id, {
    source: 'google_docs'
  });

  res.json({
    success: true,
    data: result
  });
}));

/**
 * POST /documents/google/sync/sheet
 * Sync Google Sheet
 */
router.post('/google/sync/sheet', authenticate, requirePermission('documents:write'), [
  body('spreadsheetId').notEmpty(),
  body('teamId').optional().isUUID(),
  body('projectId').optional().isUUID()
], asyncHandler(async (req, res) => {
  const { spreadsheetId, teamId, projectId } = req.body;

  const result = await googleService.syncSpreadsheet(
    req.user.userId,
    spreadsheetId,
    teamId,
    projectId
  );

  await logAction(req, AUDIT_ACTIONS.DOCUMENT_SYNCED, 'Document', result.document.id, {
    source: 'google_sheets',
    rows: result.data.length
  });

  res.json({
    success: true,
    data: result
  });
}));

/**
 * POST /documents/google/import-teams
 * Import teams from Google Sheet
 */
router.post('/google/import-teams', authenticate, requirePermission('teams:write'), [
  body('spreadsheetId').notEmpty(),
  body('range').optional()
], asyncHandler(async (req, res) => {
  const { spreadsheetId, range } = req.body;

  const result = await googleService.importTeamsFromSheet(
    req.user.userId,
    spreadsheetId,
    range || 'Teams'
  );

  res.json({
    success: true,
    data: result
  });
}));

/**
 * DELETE /documents/:documentId
 * Soft delete document
 */
router.delete('/:documentId', authenticate, requirePermission('documents:delete'), [
  param('documentId').isUUID()
], asyncHandler(async (req, res) => {
  await prisma.document.update({
    where: { id: req.params.documentId },
    data: { deletedAt: new Date() }
  });

  await logAction(req, AUDIT_ACTIONS.DOCUMENT_DELETED, 'Document', req.params.documentId);

  res.json({
    success: true,
    message: 'Document deleted'
  });
}));

module.exports = router;

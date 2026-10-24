const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'temple_records.db');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Initialize SQLite database
const db = new DatabaseSync(DB_FILE);

// Enable foreign keys and WAL mode for better concurrency and durability
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    place_id INTEGER NOT NULL,
    person_name TEXT NOT NULL,
    amount REAL NOT NULL CHECK(amount >= 0),
    mobile TEXT DEFAULT '',
    address TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_records_place_id ON records(place_id);
`);

// Migration safeguard: Ensure 'mobile' and 'address' columns exist if DB was created previously
try {
  const columns = db.prepare("PRAGMA table_info(records)").all();
  const colNames = columns.map(c => c.name);
  if (!colNames.includes('mobile')) {
    db.exec("ALTER TABLE records ADD COLUMN mobile TEXT DEFAULT ''");
  }
  if (!colNames.includes('address')) {
    db.exec("ALTER TABLE records ADD COLUMN address TEXT DEFAULT ''");
  }
} catch (e) {
  console.error('Migration notice:', e.message);
}

// Prepared statements
const stmts = {
  getSummary: db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM places) AS total_places,
      (SELECT COUNT(*) FROM records) AS total_records,
      (SELECT COALESCE(SUM(amount), 0) FROM records) AS total_amount
  `),
  getPlaces: db.prepare(`
    SELECT 
      p.id, 
      p.name, 
      p.created_at,
      COUNT(r.id) AS person_count,
      COALESCE(SUM(r.amount), 0) AS total_amount
    FROM places p
    LEFT JOIN records r ON p.id = r.place_id
    GROUP BY p.id
    ORDER BY p.name ASC
  `),
  getPlaceById: db.prepare(`SELECT * FROM places WHERE id = ?`),
  insertPlace: db.prepare(`INSERT INTO places (name) VALUES (?)`),
  updatePlace: db.prepare(`UPDATE places SET name = ? WHERE id = ?`),
  deletePlace: db.prepare(`DELETE FROM places WHERE id = ?`),

  getRecordsBase: `
    SELECT 
      r.id,
      r.place_id,
      p.name AS place_name,
      r.person_name,
      r.amount,
      COALESCE(r.mobile, '') AS mobile,
      COALESCE(r.address, '') AS address,
      r.created_at
    FROM records r
    JOIN places p ON r.place_id = p.id
  `,
  getRecordById: db.prepare(`SELECT * FROM records WHERE id = ?`),
  insertRecord: db.prepare(`
    INSERT INTO records (place_id, person_name, amount, mobile, address, created_at) 
    VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now', 'localtime')))
  `),
  updateRecord: db.prepare(`
    UPDATE records 
    SET place_id = ?, person_name = ?, amount = ?, mobile = ?, address = ?, created_at = COALESCE(?, created_at)
    WHERE id = ?
  `),
  deleteRecord: db.prepare(`DELETE FROM records WHERE id = ?`),

  getAllRecordsForExport: db.prepare(`
    SELECT 
      r.id,
      p.name AS place_name,
      r.person_name,
      COALESCE(r.mobile, '') AS mobile,
      COALESCE(r.address, '') AS address,
      r.amount,
      r.created_at
    FROM records r
    JOIN places p ON r.place_id = p.id
    ORDER BY p.name ASC, r.person_name ASC
  `)
};

// MIME types dictionary for static files
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png'
};

// Helper: Parse JSON request body
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

// Helper: Send JSON response
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

// Helper: Send error response
function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

// Helper: Get local IP addresses for mobile testing
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

// Main HTTP request listener
const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  try {
    // ----------------------------------------------------
    // API ROUTES
    // ----------------------------------------------------

    // 1. GET /api/summary
    if (pathname === '/api/summary' && req.method === 'GET') {
      const summary = stmts.getSummary.get();
      return sendJson(res, 200, summary);
    }

    // 2. GET /api/places
    if (pathname === '/api/places' && req.method === 'GET') {
      const places = stmts.getPlaces.all();
      return sendJson(res, 200, places);
    }

    // 3. POST /api/places
    if (pathname === '/api/places' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const name = (body.name || '').trim();

      if (!name) {
        return sendError(res, 400, 'Place name cannot be empty');
      }

      try {
        const result = stmts.insertPlace.run(name);
        return sendJson(res, 201, {
          success: true,
          id: result.lastInsertRowid,
          name
        });
      } catch (err) {
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
          return sendError(res, 409, `Place "${name}" already exists`);
        }
        throw err;
      }
    }

    // 4. PUT /api/places/:id
    const placeMatch = pathname.match(/^\/api\/places\/(\d+)$/);
    if (placeMatch && req.method === 'PUT') {
      const placeId = parseInt(placeMatch[1], 10);
      const body = await parseJsonBody(req);
      const name = (body.name || '').trim();

      if (!name) {
        return sendError(res, 400, 'Place name cannot be empty');
      }

      try {
        const result = stmts.updatePlace.run(name, placeId);
        if (result.changes === 0) {
          return sendError(res, 404, 'Place not found');
        }
        return sendJson(res, 200, { success: true, id: placeId, name });
      } catch (err) {
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
          return sendError(res, 409, `Place "${name}" already exists`);
        }
        throw err;
      }
    }

    // 5. DELETE /api/places/:id
    if (placeMatch && req.method === 'DELETE') {
      const placeId = parseInt(placeMatch[1], 10);
      const result = stmts.deletePlace.run(placeId);
      if (result.changes === 0) {
        return sendError(res, 404, 'Place not found');
      }
      return sendJson(res, 200, { success: true, message: 'Place and all its records deleted' });
    }

    // 6. GET /api/records
    if (pathname === '/api/records' && req.method === 'GET') {
      const placeId = parsedUrl.searchParams.get('place_id');
      const search = (parsedUrl.searchParams.get('search') || '').trim();

      let query = stmts.getRecordsBase;
      const conditions = [];
      const params = [];

      if (placeId && placeId !== 'all') {
        conditions.push('r.place_id = ?');
        params.push(parseInt(placeId, 10));
      }

      if (search) {
        conditions.push('(r.person_name LIKE ? OR p.name LIKE ? OR r.mobile LIKE ? OR r.address LIKE ?)');
        const searchPattern = `%${search}%`;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY r.id DESC';

      const queryStmt = db.prepare(query);
      const records = queryStmt.all(...params);
      return sendJson(res, 200, records);
    }

    // 7. POST /api/records
    if (pathname === '/api/records' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const placeId = parseInt(body.place_id, 10);
      const personName = (body.person_name || '').trim();
      const amount = parseFloat(body.amount);
      const mobile = (body.mobile || '').trim();
      const address = (body.address || '').trim();
      const customTime = body.created_at ? body.created_at.trim() : null;

      if (!placeId || isNaN(placeId)) {
        return sendError(res, 400, 'Please select a valid place');
      }
      if (!personName) {
        return sendError(res, 400, 'Person name cannot be empty');
      }
      if (isNaN(amount) || amount < 0) {
        return sendError(res, 400, 'Amount must be a non-negative number');
      }

      // Check if place exists
      const place = stmts.getPlaceById.get(placeId);
      if (!place) {
        return sendError(res, 404, 'Selected place does not exist');
      }

      const result = stmts.insertRecord.run(placeId, personName, amount, mobile, address, customTime);
      return sendJson(res, 201, {
        success: true,
        id: result.lastInsertRowid,
        place_id: placeId,
        person_name: personName,
        amount,
        mobile,
        address
      });
    }

    // 8. PUT /api/records/:id
    const recordMatch = pathname.match(/^\/api\/records\/(\d+)$/);
    if (recordMatch && req.method === 'PUT') {
      const recordId = parseInt(recordMatch[1], 10);
      const body = await parseJsonBody(req);
      const placeId = parseInt(body.place_id, 10);
      const personName = (body.person_name || '').trim();
      const amount = parseFloat(body.amount);
      const mobile = (body.mobile || '').trim();
      const address = (body.address || '').trim();
      const customTime = body.created_at ? body.created_at.trim() : null;

      if (!placeId || isNaN(placeId)) {
        return sendError(res, 400, 'Please select a valid place');
      }
      if (!personName) {
        return sendError(res, 400, 'Person name cannot be empty');
      }
      if (isNaN(amount) || amount < 0) {
        return sendError(res, 400, 'Amount must be a non-negative number');
      }

      const result = stmts.updateRecord.run(placeId, personName, amount, mobile, address, customTime, recordId);
      if (result.changes === 0) {
        return sendError(res, 404, 'Record not found');
      }
      return sendJson(res, 200, { success: true, id: recordId });
    }

    // 9. DELETE /api/records/:id
    if (recordMatch && req.method === 'DELETE') {
      const recordId = parseInt(recordMatch[1], 10);
      const result = stmts.deleteRecord.run(recordId);
      if (result.changes === 0) {
        return sendError(res, 404, 'Record not found');
      }
      return sendJson(res, 200, { success: true, message: 'Record deleted' });
    }

    // 10. GET /api/export (CSV Download)
    if (pathname === '/api/export' && req.method === 'GET') {
      const records = stmts.getAllRecordsForExport.all();
      let csv = '\uFEFF"S.No","Place Name","Person Name","Mobile Number","Address","Amount (₹)","Date & Time"\r\n';
      records.forEach((r, idx) => {
        const place = (r.place_name || '').replace(/"/g, '""');
        const person = (r.person_name || '').replace(/"/g, '""');
        const mobile = (r.mobile || '').replace(/"/g, '""');
        const address = (r.address || '').replace(/"/g, '""');
        const amount = Number(r.amount).toFixed(2);
        const date = (r.created_at || '').replace(/"/g, '""');
        csv += `"${idx + 1}","${place}","${person}","${mobile}","${address}","${amount}","${date}"\r\n`;
      });

      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="temple_records_export.csv"',
        'Cache-Control': 'no-store'
      });
      return res.end(csv);
    }

    // ----------------------------------------------------
    // STATIC FILE SERVING
    // ----------------------------------------------------
    let reqPath = pathname === '/' ? '/index.html' : pathname;
    const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(PUBLIC_DIR, safePath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      return fs.createReadStream(filePath).pipe(res);
    }

    // Default 404 for unknown routes
    sendError(res, 404, 'Not Found');
  } catch (error) {
    console.error('Server error handling request:', error);
    sendError(res, 500, 'Internal Server Error: ' + error.message);
  }
});

// Start listening
server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(` Temple Contribution & Records Manager is running!`);
  console.log(` Local access:   http://localhost:${PORT}`);
  const ips = getLocalIpAddresses();
  if (ips.length > 0) {
    console.log(` Mobile access:  http://${ips[0]}:${PORT} (on same Wi-Fi)`);
  }
  console.log(` Database:       ${DB_FILE}`);
  console.log(`=======================================================`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nClosing database and stopping server...');
  db.close();
  server.close(() => {
    console.log('Server stopped.');
    process.exit(0);
  });
});

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm',
};

const server = http.createServer((req, res) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);

    // Default to index.html for root path
    let filePath = req.url === '/' ? '/individual/portal.html' : req.url;

    // Remove query parameters
    filePath = filePath.split('?')[0];

    // Build full path
    const fullPath = path.join(__dirname, filePath);

    // Get file extension
    const extname = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    // Read and serve file
    fs.readFile(fullPath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                // File not found
                res.writeHead(404);
                res.end('404 - File Not Found');
                console.error(`404 - ${fullPath}`);
            } else {
                // Server error
                res.writeHead(500);
                res.end(`500 - Internal Server Error: ${error.code}`);
                console.error(`500 - ${error.code}`);
            }
        } else {
            // Success
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║                                                           ║');
    console.log('║   GBA Platform - Individual Portal Server                 ║');
    console.log('║                                                           ║');
    console.log('║   Server running at:                                      ║');
    console.log('║   http://localhost:' + PORT.toString().padEnd(34) + '║');
    console.log('║                                                           ║');
    console.log('║   Main Portal:                                            ║');
    console.log('║   http://localhost:' + PORT.toString().padEnd(21) + 'individual/portal.html'.padEnd(13) + '║');
    console.log('║                                                           ║');
    console.log('║   Resume Generator:                                       ║');
    console.log('║   http://localhost:' + PORT.toString().padEnd(21) + 'individual/demo-resume-generator.html'.padEnd(13) + '║');
    console.log('║                                                           ║');
    console.log('║   Interview Prep:                                         ║');
    console.log('║   http://localhost:' + PORT.toString().padEnd(21) + 'individual/demo-interview.html'.padEnd(13) + '║');
    console.log('║                                                           ║');
    console.log('║   Learning Path:                                          ║');
    console.log('║   http://localhost:' + PORT.toString().padEnd(21) + 'individual/demo-learning-path.html'.padEnd(13) + '║');
    console.log('║                                                           ║');
    console.log('║   Press Ctrl+C to stop the server                         ║');
    console.log('║                                                           ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('Note: Make sure the backend server is running on http://localhost:8000');
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('\nShutting down server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

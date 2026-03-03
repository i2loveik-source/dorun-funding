import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(process.cwd(), "dist", "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html for any GET route not handled by static files
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
}

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

/**
 * Safely extracts a ZIP archive across platforms (macOS, Linux, Windows)
 */
export function extractZipSafe(packagePath, destinationDir) {
  if (process.platform === 'win32') {
    // Windows: Use PowerShell Expand-Archive
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Expand-Archive -LiteralPath "${packagePath}" -DestinationPath "${destinationDir}" -Force`,
    ], { stdio: 'pipe' });
  } else {
    // macOS / Linux: use unzip or /usr/bin/unzip
    const unzipBin = fs.existsSync('/usr/bin/unzip') ? '/usr/bin/unzip' : 'unzip';
    execFileSync(unzipBin, ['-q', packagePath, '-d', destinationDir], { stdio: 'pipe' });
  }
}

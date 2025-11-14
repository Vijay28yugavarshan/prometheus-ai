/*
Safer runner scaffold (DO NOT enable without full security review).
Demonstrates writing code to a temp dir and invoking a Docker container with strict limits.
*/
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';

export async function runCodeSandbox(code, lang='python') {
  const dir = '/tmp/prometheus_sandbox';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const fileName = lang === 'python' ? 'script.py' : 'script.sh';
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, code, { mode: 0o600 });
  // Build docker command (template) - requires the image and mounting the file as read-only
  const cmd = [
    'docker', 'run', '--rm',
    '--network', 'none',
    '-m', '128m',
    '--cpus', '0.5',
    '--pids-limit', '64',
    '--read-only',
    '-v', `${dir}:/sandbox:ro`,
    '--tmpfs', '/tmp:rw,size=16m',
    '--security-opt', 'no-new-privileges:true',
    'python:3.11-alpine',
    'sh', '-c', 'timeout 5s python /sandbox/' + fileName
  ];
  return new Promise((resolve, reject) => {
    execFile(cmd[0], cmd.slice(1), { timeout: 10000 }, (err, stdout, stderr) => {
      if (err) return reject({ err: err.toString(), stdout, stderr });
      resolve({ stdout, stderr });
    });
  });
}

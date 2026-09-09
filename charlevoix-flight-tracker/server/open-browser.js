import { spawn } from 'node:child_process';

/**
 * Open the tracker in the default browser.
 *
 * Best effort only: on a headless machine (a Raspberry Pi in a closet, say)
 * there is nothing to open, and that must not stop the server. Pass --no-open
 * or set OPEN=0 to skip it.
 */
export function openInBrowser(url) {
  const command =
    process.platform === 'darwin' ? { cmd: 'open', args: [url] }
    : process.platform === 'win32' ? { cmd: 'cmd', args: ['/c', 'start', '', url] }
    : { cmd: 'xdg-open', args: [url] };

  try {
    const child = spawn(command.cmd, command.args, { stdio: 'ignore', detached: true });
    child.on('error', () => {}); // no browser here; the URL is printed above
    child.unref();
  } catch {
    // Never let this take the server down.
  }
}

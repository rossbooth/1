import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Open the tracker in the default browser.
 *
 * Best effort only: on a headless machine (a Raspberry Pi in a closet, say)
 * there is nothing to open, and that must not stop the server. Pass --no-open
 * or set OPEN=0 to skip it.
 *
 * When it cannot open anything it says so, rather than failing silently and
 * leaving you wondering why no window appeared.
 */

/** WSL reports platform 'linux' but needs the Windows opener. */
function isWsl() {
  if (process.platform !== 'linux') return false;
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true;
  try {
    return /microsoft/i.test(readFileSync('/proc/version', 'utf8'));
  } catch {
    return false;
  }
}

/** Candidate openers, best first. */
function candidates(url) {
  if (process.platform === 'darwin') return [['open', [url]]];
  if (process.platform === 'win32') return [['cmd', ['/c', 'start', '', url]]];
  if (isWsl()) {
    return [
      ['wslview', [url]],
      ['powershell.exe', ['-NoProfile', '-Command', 'Start-Process', url]],
      ['cmd.exe', ['/c', 'start', '', url]],
    ];
  }
  // Linux and friends. $BROWSER wins when the user has set one.
  const list = [];
  if (process.env.BROWSER) list.push([process.env.BROWSER, [url]]);
  list.push(['xdg-open', [url]], ['gio', ['open', url]], ['sensible-browser', [url]], ['x-www-browser', [url]]);
  return list;
}

/** True when a Linux box has no graphical session to open a window in. */
function headless() {
  return (
    process.platform === 'linux' &&
    !isWsl() &&
    !process.env.DISPLAY &&
    !process.env.WAYLAND_DISPLAY
  );
}

export function openInBrowser(url) {
  if (headless()) {
    console.log(`  No desktop session here, so nothing to open. Browse to ${url} yourself.`);
    return;
  }

  const queue = candidates(url);

  const attempt = () => {
    const next = queue.shift();
    if (!next) {
      console.log(`  Could not open a browser automatically. Browse to ${url} yourself.`);
      return;
    }
    const [cmd, args] = next;
    // A failed spawn can fire both 'error' and 'exit'; only move on once.
    let moved = false;
    const moveOn = () => {
      if (moved) return;
      moved = true;
      attempt();
    };
    try {
      const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
      // ENOENT (no such opener) and a non-zero exit both mean: try the next one.
      child.on('error', moveOn);
      child.on('exit', (code) => {
        if (code !== 0) moveOn();
      });
      child.unref();
    } catch {
      moveOn();
    }
  };

  attempt();
}

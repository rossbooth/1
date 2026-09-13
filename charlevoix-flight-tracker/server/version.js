import { execFileSync } from 'node:child_process';
import { ROOT } from './config.js';

/**
 * Which copy of the code is this?
 *
 * It is easy to end up with two clones of a project and serve the one you are
 * not editing -- the page never changes however often you pull. The startup
 * banner prints this so that mistake is visible immediately instead of looking
 * like a caching problem.
 *
 * Best effort: a download with no .git, or a machine with no git installed,
 * simply reports nothing.
 */
export function codeVersion() {
  const git = (...args) =>
    execFileSync('git', ['-C', ROOT, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

  try {
    const commit = git('rev-parse', '--short', 'HEAD');
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
    let dirty = false;
    try {
      dirty = git('status', '--porcelain').length > 0;
    } catch {
      // Not fatal; just report the commit.
    }
    return { commit, branch, dirty };
  } catch {
    return null;
  }
}

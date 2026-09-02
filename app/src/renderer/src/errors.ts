// ipcRenderer.invoke wraps every main-process failure in its own preamble;
// only the tail carries something a user can act on.
const REMOTE_METHOD_PREFIX = /^Error invoking remote method '[^']*': (?:Error: )?/;

export function errorMessage(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).replace(REMOTE_METHOD_PREFIX, '');
}

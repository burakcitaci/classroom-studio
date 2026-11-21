// On Windows a launcher can be terminated without forwarding a shutdown signal.
// Keep the foreground API from outliving that launcher and retaining its port.
export function watchParentProcess() {
  const parent = process.ppid;
  if (parent <= 1) return;

  setInterval(() => {
    try {
      process.kill(parent, 0);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ESRCH') {
        console.log('Classroom Studio launcher exited; stopping the API.');
        process.exit(0);
      }
    }
  }, 1000).unref();
}

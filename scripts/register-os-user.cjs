// tsx asks node:os for the current username while its loader is starting.
// A small number of Windows/libuv builds abort there with ENOMEM. CommonJS
// preloads also run inside Node's loader worker, so patch that narrow call before
// tsx starts while leaving every non-Windows environment untouched.
if (process.platform === "win32") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("node:os");
  const originalUserInfo = os.userInfo;
  os.userInfo = (...args) => {
    try {
      return originalUserInfo(...args);
    } catch {
      return {
        uid: -1,
        gid: -1,
        username: process.env.USERNAME || "windows-user",
        homedir: process.env.USERPROFILE || process.cwd(),
        shell: null,
      };
    }
  };
}

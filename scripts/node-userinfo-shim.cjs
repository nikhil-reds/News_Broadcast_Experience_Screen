const os = require("node:os");

if (process.platform === "win32") {
  const fallbackUsername = process.env.USERNAME || process.env.USER || "codex";
  const originalUserInfo = os.userInfo;

  os.userInfo = function userInfoShim(options) {
    try {
      return originalUserInfo.call(os, options);
    } catch (error) {
      if (error && error.code !== "ERR_SYSTEM_ERROR") throw error;
      return {
        uid: -1,
        gid: -1,
        username: fallbackUsername,
        homedir: process.env.USERPROFILE || process.env.HOME || process.cwd(),
        shell: null,
      };
    }
  };
}

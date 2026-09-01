"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/dotenv/lib/main.js
var require_main = __commonJS({
  "node_modules/dotenv/lib/main.js"(exports2, module2) {
    var fs = require("fs");
    var path = require("path");
    var os = require("os");
    var crypto = require("crypto");
    var TIPS = [
      "\u25C8 encrypted .env [www.dotenvx.com]",
      "\u25C8 secrets for agents [www.dotenvx.com]",
      "\u2301 auth for agents [www.vestauth.com]",
      "\u2318 custom filepath { path: '/custom/path/.env' }",
      "\u2318 enable debugging { debug: true }",
      "\u2318 override existing { override: true }",
      "\u2318 suppress logs { quiet: true }",
      "\u2318 multiple files { path: ['.env.local', '.env'] }"
    ];
    function _getRandomTip() {
      return TIPS[Math.floor(Math.random() * TIPS.length)];
    }
    function parseBoolean(value) {
      if (typeof value === "string") {
        return !["false", "0", "no", "off", ""].includes(value.toLowerCase());
      }
      return Boolean(value);
    }
    function supportsAnsi() {
      return process.stdout.isTTY;
    }
    function dim(text) {
      return supportsAnsi() ? `\x1B[2m${text}\x1B[0m` : text;
    }
    var LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg;
    function parse(src) {
      const obj = {};
      let lines = src.toString();
      lines = lines.replace(/\r\n?/mg, "\n");
      let match;
      while ((match = LINE.exec(lines)) != null) {
        const key = match[1];
        let value = match[2] || "";
        value = value.trim();
        const maybeQuote = value[0];
        value = value.replace(/^(['"`])([\s\S]*)\1$/mg, "$2");
        if (maybeQuote === '"') {
          value = value.replace(/\\n/g, "\n");
          value = value.replace(/\\r/g, "\r");
        }
        obj[key] = value;
      }
      return obj;
    }
    function _parseVault(options) {
      options = options || {};
      const vaultPath = _vaultPath(options);
      options.path = vaultPath;
      const result = DotenvModule.configDotenv(options);
      if (!result.parsed) {
        const err = new Error(`MISSING_DATA: Cannot parse ${vaultPath} for an unknown reason`);
        err.code = "MISSING_DATA";
        throw err;
      }
      const keys = _dotenvKey(options).split(",");
      const length = keys.length;
      let decrypted;
      for (let i = 0; i < length; i++) {
        try {
          const key = keys[i].trim();
          const attrs = _instructions(result, key);
          decrypted = DotenvModule.decrypt(attrs.ciphertext, attrs.key);
          break;
        } catch (error) {
          if (i + 1 >= length) {
            throw error;
          }
        }
      }
      return DotenvModule.parse(decrypted);
    }
    function _warn(message) {
      console.error(`\u26A0 ${message}`);
    }
    function _debug(message) {
      console.log(`\u2506 ${message}`);
    }
    function _log(message) {
      console.log(`\u25C7 ${message}`);
    }
    function _dotenvKey(options) {
      if (options && options.DOTENV_KEY && options.DOTENV_KEY.length > 0) {
        return options.DOTENV_KEY;
      }
      if (process.env.DOTENV_KEY && process.env.DOTENV_KEY.length > 0) {
        return process.env.DOTENV_KEY;
      }
      return "";
    }
    function _instructions(result, dotenvKey) {
      let uri;
      try {
        uri = new URL(dotenvKey);
      } catch (error) {
        if (error.code === "ERR_INVALID_URL") {
          const err = new Error("INVALID_DOTENV_KEY: Wrong format. Must be in valid uri format like dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=development");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        }
        throw error;
      }
      const key = uri.password;
      if (!key) {
        const err = new Error("INVALID_DOTENV_KEY: Missing key part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environment = uri.searchParams.get("environment");
      if (!environment) {
        const err = new Error("INVALID_DOTENV_KEY: Missing environment part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environmentKey = `DOTENV_VAULT_${environment.toUpperCase()}`;
      const ciphertext = result.parsed[environmentKey];
      if (!ciphertext) {
        const err = new Error(`NOT_FOUND_DOTENV_ENVIRONMENT: Cannot locate environment ${environmentKey} in your .env.vault file.`);
        err.code = "NOT_FOUND_DOTENV_ENVIRONMENT";
        throw err;
      }
      return { ciphertext, key };
    }
    function _vaultPath(options) {
      let possibleVaultPath = null;
      if (options && options.path && options.path.length > 0) {
        if (Array.isArray(options.path)) {
          for (const filepath of options.path) {
            if (fs.existsSync(filepath)) {
              possibleVaultPath = filepath.endsWith(".vault") ? filepath : `${filepath}.vault`;
            }
          }
        } else {
          possibleVaultPath = options.path.endsWith(".vault") ? options.path : `${options.path}.vault`;
        }
      } else {
        possibleVaultPath = path.resolve(process.cwd(), ".env.vault");
      }
      if (fs.existsSync(possibleVaultPath)) {
        return possibleVaultPath;
      }
      return null;
    }
    function _resolveHome(envPath) {
      return envPath[0] === "~" ? path.join(os.homedir(), envPath.slice(1)) : envPath;
    }
    function _configVault(options) {
      const debug = parseBoolean(process.env.DOTENV_CONFIG_DEBUG || options && options.debug);
      const quiet = parseBoolean(process.env.DOTENV_CONFIG_QUIET || options && options.quiet);
      if (debug || !quiet) {
        _log("loading env from encrypted .env.vault");
      }
      const parsed = DotenvModule._parseVault(options);
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      DotenvModule.populate(processEnv, parsed, options);
      return { parsed };
    }
    function configDotenv(options) {
      const dotenvPath = path.resolve(process.cwd(), ".env");
      let encoding = "utf8";
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      let debug = parseBoolean(processEnv.DOTENV_CONFIG_DEBUG || options && options.debug);
      let quiet = parseBoolean(processEnv.DOTENV_CONFIG_QUIET || options && options.quiet);
      if (options && options.encoding) {
        encoding = options.encoding;
      } else {
        if (debug) {
          _debug("no encoding is specified (UTF-8 is used by default)");
        }
      }
      let optionPaths = [dotenvPath];
      if (options && options.path) {
        if (!Array.isArray(options.path)) {
          optionPaths = [_resolveHome(options.path)];
        } else {
          optionPaths = [];
          for (const filepath of options.path) {
            optionPaths.push(_resolveHome(filepath));
          }
        }
      }
      let lastError;
      const parsedAll = {};
      for (const path2 of optionPaths) {
        try {
          const parsed = DotenvModule.parse(fs.readFileSync(path2, { encoding }));
          DotenvModule.populate(parsedAll, parsed, options);
        } catch (e) {
          if (debug) {
            _debug(`failed to load ${path2} ${e.message}`);
          }
          lastError = e;
        }
      }
      const populated = DotenvModule.populate(processEnv, parsedAll, options);
      debug = parseBoolean(processEnv.DOTENV_CONFIG_DEBUG || debug);
      quiet = parseBoolean(processEnv.DOTENV_CONFIG_QUIET || quiet);
      if (debug || !quiet) {
        const keysCount = Object.keys(populated).length;
        const shortPaths = [];
        for (const filePath of optionPaths) {
          try {
            const relative = path.relative(process.cwd(), filePath);
            shortPaths.push(relative);
          } catch (e) {
            if (debug) {
              _debug(`failed to load ${filePath} ${e.message}`);
            }
            lastError = e;
          }
        }
        _log(`injected env (${keysCount}) from ${shortPaths.join(",")} ${dim(`// tip: ${_getRandomTip()}`)}`);
      }
      if (lastError) {
        return { parsed: parsedAll, error: lastError };
      } else {
        return { parsed: parsedAll };
      }
    }
    function config(options) {
      if (_dotenvKey(options).length === 0) {
        return DotenvModule.configDotenv(options);
      }
      const vaultPath = _vaultPath(options);
      if (!vaultPath) {
        _warn(`you set DOTENV_KEY but you are missing a .env.vault file at ${vaultPath}`);
        return DotenvModule.configDotenv(options);
      }
      return DotenvModule._configVault(options);
    }
    function decrypt(encrypted, keyStr) {
      const key = Buffer.from(keyStr.slice(-64), "hex");
      let ciphertext = Buffer.from(encrypted, "base64");
      const nonce = ciphertext.subarray(0, 12);
      const authTag = ciphertext.subarray(-16);
      ciphertext = ciphertext.subarray(12, -16);
      try {
        const aesgcm = crypto.createDecipheriv("aes-256-gcm", key, nonce);
        aesgcm.setAuthTag(authTag);
        return `${aesgcm.update(ciphertext)}${aesgcm.final()}`;
      } catch (error) {
        const isRange = error instanceof RangeError;
        const invalidKeyLength = error.message === "Invalid key length";
        const decryptionFailed = error.message === "Unsupported state or unable to authenticate data";
        if (isRange || invalidKeyLength) {
          const err = new Error("INVALID_DOTENV_KEY: It must be 64 characters long (or more)");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        } else if (decryptionFailed) {
          const err = new Error("DECRYPTION_FAILED: Please check your DOTENV_KEY");
          err.code = "DECRYPTION_FAILED";
          throw err;
        } else {
          throw error;
        }
      }
    }
    function populate(processEnv, parsed, options = {}) {
      const debug = Boolean(options && options.debug);
      const override = Boolean(options && options.override);
      const populated = {};
      if (typeof parsed !== "object") {
        const err = new Error("OBJECT_REQUIRED: Please check the processEnv argument being passed to populate");
        err.code = "OBJECT_REQUIRED";
        throw err;
      }
      for (const key of Object.keys(parsed)) {
        if (Object.prototype.hasOwnProperty.call(processEnv, key)) {
          if (override === true) {
            processEnv[key] = parsed[key];
            populated[key] = parsed[key];
          }
          if (debug) {
            if (override === true) {
              _debug(`"${key}" is already defined and WAS overwritten`);
            } else {
              _debug(`"${key}" is already defined and was NOT overwritten`);
            }
          }
        } else {
          processEnv[key] = parsed[key];
          populated[key] = parsed[key];
        }
      }
      return populated;
    }
    var DotenvModule = {
      configDotenv,
      _configVault,
      _parseVault,
      config,
      decrypt,
      parse,
      populate
    };
    module2.exports.configDotenv = DotenvModule.configDotenv;
    module2.exports._configVault = DotenvModule._configVault;
    module2.exports._parseVault = DotenvModule._parseVault;
    module2.exports.config = DotenvModule.config;
    module2.exports.decrypt = DotenvModule.decrypt;
    module2.exports.parse = DotenvModule.parse;
    module2.exports.populate = DotenvModule.populate;
    module2.exports = DotenvModule;
  }
});

// node_modules/dotenv/lib/env-options.js
var require_env_options = __commonJS({
  "node_modules/dotenv/lib/env-options.js"(exports2, module2) {
    var options = {};
    if (process.env.DOTENV_CONFIG_ENCODING != null) {
      options.encoding = process.env.DOTENV_CONFIG_ENCODING;
    }
    if (process.env.DOTENV_CONFIG_PATH != null) {
      options.path = process.env.DOTENV_CONFIG_PATH;
    }
    if (process.env.DOTENV_CONFIG_QUIET != null) {
      options.quiet = process.env.DOTENV_CONFIG_QUIET;
    }
    if (process.env.DOTENV_CONFIG_DEBUG != null) {
      options.debug = process.env.DOTENV_CONFIG_DEBUG;
    }
    if (process.env.DOTENV_CONFIG_OVERRIDE != null) {
      options.override = process.env.DOTENV_CONFIG_OVERRIDE;
    }
    if (process.env.DOTENV_CONFIG_DOTENV_KEY != null) {
      options.DOTENV_KEY = process.env.DOTENV_CONFIG_DOTENV_KEY;
    }
    module2.exports = options;
  }
});

// node_modules/dotenv/lib/cli-options.js
var require_cli_options = __commonJS({
  "node_modules/dotenv/lib/cli-options.js"(exports2, module2) {
    var re = /^dotenv_config_(encoding|path|quiet|debug|override|DOTENV_KEY)=(.+)$/;
    module2.exports = function optionMatcher(args) {
      const options = args.reduce(function(acc, cur) {
        const matches = cur.match(re);
        if (matches) {
          acc[matches[1]] = matches[2];
        }
        return acc;
      }, {});
      if (!("quiet" in options)) {
        options.quiet = "true";
      }
      return options;
    };
  }
});

// lib/prisma.ts
var import_client, import_adapter_pg, import_pg, globalForPrisma, pool, prisma;
var init_prisma = __esm({
  "lib/prisma.ts"() {
    "use strict";
    import_client = require("@prisma/client");
    import_adapter_pg = require("@prisma/adapter-pg");
    import_pg = require("pg");
    globalForPrisma = globalThis;
    pool = globalForPrisma.__prismaPool ?? new import_pg.Pool({ connectionString: process.env.DATABASE_URL });
    prisma = globalForPrisma.__prisma ?? new import_client.PrismaClient({ adapter: new import_adapter_pg.PrismaPg(pool) });
    if (process.env.NODE_ENV !== "production") {
      globalForPrisma.__prismaPool = pool;
      globalForPrisma.__prisma = prisma;
    }
  }
});

// lib/green-screen.ts
function composedFilename(backgroundId, sourceFilename) {
  const stamp = sourceFilename.replace(/\.[^.]+$/, "");
  return `greenscreen-v2-${backgroundId}-${stamp}.mp4`;
}
var GREEN_SCREEN_BACKGROUNDS;
var init_green_screen = __esm({
  "lib/green-screen.ts"() {
    "use strict";
    GREEN_SCREEN_BACKGROUNDS = [
      {
        id: "newsroom-blue",
        label: "Newsroom Blue",
        image: "/backgrounds/newsroom-blue.jpg",
        thumb: "/backgrounds/thumbs/newsroom-blue.jpg"
      },
      {
        id: "city-skyline",
        label: "City Skyline",
        image: "/backgrounds/city-skyline.jpg",
        thumb: "/backgrounds/thumbs/city-skyline.jpg"
      },
      {
        id: "world-map",
        label: "World Map",
        image: "/backgrounds/world-map.jpg",
        thumb: "/backgrounds/thumbs/world-map.jpg"
      },
      {
        id: "sunrise-studio",
        label: "Sunrise Studio",
        image: "/backgrounds/sunrise-studio.jpg",
        thumb: "/backgrounds/thumbs/sunrise-studio.jpg"
      },
      {
        id: "corporate-grey",
        label: "Corporate Grey",
        image: "/backgrounds/corporate-grey.jpg",
        thumb: "/backgrounds/thumbs/corporate-grey.jpg"
      }
    ];
  }
});

// lib/minio.ts
async function ensureBucket(bucket) {
  try {
    const exists = await minioClient.bucketExists(bucket);
    if (!exists) {
      await minioClient.makeBucket(bucket);
    }
  } catch (err) {
    if (err.code === "BucketAlreadyOwnedByYou" || err.code === "BucketAlreadyExists") {
      return;
    }
    throw err;
  }
}
async function uploadObject(bucket, key, buffer, contentType) {
  await ensureBucket(bucket);
  await minioClient.putObject(
    bucket,
    key,
    buffer,
    buffer.length,
    contentType ? { "Content-Type": contentType } : void 0
  );
}
async function downloadObjectToFile(bucket, key, destPath) {
  const { createWriteStream } = await import("node:fs");
  const { pipeline } = await import("node:stream/promises");
  const stream = await minioClient.getObject(bucket, key);
  await pipeline(stream, createWriteStream(destPath));
}
async function deleteObject(bucket, key) {
  try {
    await minioClient.removeObject(bucket, key);
  } catch (err) {
    if (err?.code === "NoSuchKey" || err?.code === "NotFound") return;
    throw err;
  }
}
var Minio, globalForMinio, minioClient, AUDIO_BUCKET, VIDEO_BUCKET, TRANSCRIPTS_BUCKET, TTS_AUDIO_BUCKET;
var init_minio = __esm({
  "lib/minio.ts"() {
    "use strict";
    Minio = __toESM(require("minio"));
    globalForMinio = globalThis;
    minioClient = globalForMinio.__minio ?? new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || "localhost",
      port: Number(process.env.MINIO_PORT || 9e3),
      useSSL: (process.env.MINIO_USE_SSL || "false") === "true",
      accessKey: process.env.MINIO_ACCESS_KEY || "admin",
      secretKey: process.env.MINIO_SECRET_KEY || "password123"
    });
    if (process.env.NODE_ENV !== "production") {
      globalForMinio.__minio = minioClient;
    }
    AUDIO_BUCKET = process.env.MINIO_BUCKET_AUDIO || "audio";
    VIDEO_BUCKET = process.env.MINIO_BUCKET_VIDEO || "videos";
    TRANSCRIPTS_BUCKET = process.env.MINIO_BUCKET_TRANSCRIPTS || "transcripts";
    TTS_AUDIO_BUCKET = process.env.MINIO_BUCKET_TTS_AUDIO || "tts-audio";
  }
});

// lib/camera-recordings.ts
function cameraIdFromFilename(filename) {
  if (filename.startsWith(CAMERA_FILENAME_PREFIX[3])) return 3;
  if (filename.startsWith(CAMERA_FILENAME_PREFIX[2])) return 2;
  if (filename.startsWith(CAMERA_FILENAME_PREFIX[1])) return 1;
  return null;
}
function highlightFilenameFor(cameraFilename) {
  const stamp = cameraFilename.replace(CAMERA_FILENAME_PREFIX[2], "").replace(CAMERA_FILENAME_PREFIX[1], "").replace(/\.[^.]+$/, "");
  return `${HIGHLIGHT_FILENAME_PREFIX}${stamp}.mp4`;
}
var CAMERA_FILENAME_PREFIX, HIGHLIGHT_FILENAME_PREFIX;
var init_camera_recordings = __esm({
  "lib/camera-recordings.ts"() {
    "use strict";
    CAMERA_FILENAME_PREFIX = {
      1: "camera-recording-",
      2: "camera2-recording-",
      3: "camera3-recording-"
    };
    HIGHLIGHT_FILENAME_PREFIX = "highlight-";
  }
});

// lib/generation-cleanup.ts
var generation_cleanup_exports = {};
__export(generation_cleanup_exports, {
  cleanupSupersededGenerations: () => cleanupSupersededGenerations
});
async function cleanupSupersededGenerations() {
  const generations = await prisma.broadcastSession.findMany({ orderBy: { seq: "desc" } });
  if (generations.length <= 1) return { deleted: [], kept: generations.map((g) => g.id) };
  const keep = /* @__PURE__ */ new Set([generations[0].id]);
  for (const screenId of Object.keys(SCREEN_REQUIREMENTS).map(Number)) {
    const status = await computeScreenBaseStatus(screenId);
    if (status?.generationId) keep.add(status.generationId);
  }
  const publications = await prisma.screenPublication.findMany({
    where: { screenId: { in: Array.from(VARIANT_SCREENS) } }
  });
  for (const pub of publications) {
    if (pub.currentGenerationId) keep.add(pub.currentGenerationId);
    if (pub.pendingGenerationId) keep.add(pub.pendingGenerationId);
  }
  const deleted = [];
  const kept = [];
  for (const gen of generations) {
    if (keep.has(gen.id)) {
      kept.push(gen.id);
      continue;
    }
    const activeTasks = await prisma.generationTask.count({
      where: { generationId: gen.id, status: { in: ["pending", "processing"] } }
    });
    if (activeTasks > 0) {
      kept.push(gen.id);
      continue;
    }
    try {
      await deleteGenerationAssets(gen.id);
      deleted.push(gen.id);
      logTask({ generationId: gen.id, taskType: "cleanup", status: "completed" });
    } catch (err) {
      const alreadyGone = err?.code === "P2025";
      logTask({
        generationId: gen.id,
        taskType: "cleanup",
        status: alreadyGone ? "completed" : "failed",
        error: alreadyGone ? "already deleted by a concurrent sweep" : err instanceof Error ? err.message : String(err)
      });
      if (alreadyGone) deleted.push(gen.id);
      else kept.push(gen.id);
    }
  }
  return { deleted, kept };
}
async function deleteGenerationAssets(generationId) {
  const recordings = await prisma.videoRecording.findMany({ where: { sessionId: generationId } });
  const cam1 = recordings.find((r) => cameraIdFromFilename(r.filename) === 1);
  for (const rec of recordings) {
    await deleteObject(rec.bucket, rec.objectKey).catch(() => {
    });
  }
  if (cam1) {
    for (const bg of GREEN_SCREEN_BACKGROUNDS) {
      await deleteObject(VIDEO_BUCKET, composedFilename(bg.id, cam1.filename)).catch(() => {
      });
    }
  }
  const audioFiles = await prisma.audioFile.findMany({ where: { sessionId: generationId } });
  for (const audio of audioFiles) {
    await deleteObject(AUDIO_BUCKET, audio.objectKey || audio.filename).catch(() => {
    });
  }
  const transcripts = await prisma.transcript.findMany({
    where: { generationId },
    include: { translations: { include: { audio: true } } }
  });
  for (const transcript of transcripts) {
    await deleteObject(TRANSCRIPTS_BUCKET, `${transcript.sourceAudio}.txt`).catch(() => {
    });
    for (const translation of transcript.translations) {
      await deleteObject(translation.bucket, translation.objectKey).catch(() => {
      });
      if (translation.audio) {
        await deleteObject(translation.audio.bucket, translation.audio.objectKey).catch(() => {
        });
      }
    }
  }
  const videoJobs = await prisma.videoJob.findMany({ where: { generationId } });
  for (const job of videoJobs) {
    if (job.outputFilename) {
      await deleteObject(VIDEO_BUCKET, job.outputFilename).catch(() => {
      });
    }
  }
  await prisma.$transaction([
    prisma.videoJob.deleteMany({ where: { generationId } }),
    prisma.transcript.deleteMany({ where: { generationId } }),
    // cascades TranscriptSegment/TranscriptTranslation/TranscriptTranslationSegment/TranslationAudio
    prisma.videoRecording.deleteMany({ where: { sessionId: generationId } }),
    prisma.audioFile.deleteMany({ where: { sessionId: generationId } }),
    // No ScreenPublication row should ever reference `generationId` here —
    // the caller's `keep` set already excludes any generation referenced by
    // current/pendingGenerationId. GenerationTask rows cascade automatically
    // when the BroadcastSession row goes.
    prisma.broadcastSession.delete({ where: { id: generationId } })
  ]);
}
var init_generation_cleanup = __esm({
  "lib/generation-cleanup.ts"() {
    "use strict";
    init_prisma();
    init_minio();
    init_green_screen();
    init_camera_recordings();
    init_generation();
  }
});

// lib/generation.ts
function logTask(f) {
  const attemptStr = f.attempt != null ? `${f.attempt}/${f.maxAttempts ?? 3}` : void 0;
  const tags = [
    f.generationId ? `[generation=${f.generationId}]` : null,
    f.screenId != null ? `[screen=${f.screenId}]` : null,
    `[task=${f.taskType}]`,
    f.jobId ? `[job=${f.jobId}]` : null,
    attemptStr ? `[attempt=${attemptStr}]` : null
  ].filter(Boolean).join(" ");
  const suffix = [
    `status=${f.status}`,
    f.durationMs != null ? `duration=${f.durationMs}ms` : null,
    f.error ? `error=${JSON.stringify(f.error)}` : null
  ].filter(Boolean).join(" ");
  const line = `${tags} ${suffix}`;
  if (f.status === "failed") console.error(line);
  else console.log(line);
}
async function markTaskProcessing(generationId, taskType, jobId) {
  if (!generationId) return 1;
  const row = await prisma.generationTask.upsert({
    where: { generationId_taskType: { generationId, taskType } },
    create: { generationId, taskType, status: "processing", attempt: 1, jobId, startedAt: /* @__PURE__ */ new Date() },
    update: { status: "processing", attempt: { increment: 1 }, jobId, startedAt: /* @__PURE__ */ new Date() }
  });
  logTask({ generationId, taskType, jobId, attempt: row.attempt, status: "processing" });
  return row.attempt;
}
async function markTaskCompleted(generationId, taskType, opts) {
  if (!generationId) return;
  await prisma.generationTask.updateMany({
    where: { generationId, taskType },
    data: { status: "completed", completedAt: /* @__PURE__ */ new Date(), errorMessage: null }
  });
  logTask({ generationId, taskType, jobId: opts?.jobId, status: "completed", durationMs: opts?.durationMs });
  await maybeMarkGenerationReady(generationId);
  triggerCleanupSweep();
}
function triggerCleanupSweep() {
  Promise.resolve().then(() => (init_generation_cleanup(), generation_cleanup_exports)).then((m) => m.cleanupSupersededGenerations()).catch((err) => console.error("[generation-cleanup] sweep failed:", err));
}
async function markTaskFailed(generationId, taskType, errorMessage, attemptsMade, maxAttempts, jobId) {
  if (!generationId) return;
  const finalFailure = attemptsMade >= maxAttempts;
  await prisma.generationTask.updateMany({
    where: { generationId, taskType },
    data: { status: finalFailure ? "failed" : "pending", errorMessage }
  });
  logTask({
    generationId,
    taskType,
    jobId,
    attempt: attemptsMade,
    maxAttempts,
    status: finalFailure ? "failed" : "retry-scheduled",
    error: errorMessage
  });
  if (finalFailure) {
    await prisma.broadcastSession.update({ where: { id: generationId }, data: { pipelineStatus: "failed" } }).catch(() => {
    });
  }
}
async function maybeMarkGenerationReady(generationId) {
  const tasks = await prisma.generationTask.findMany({ where: { generationId } });
  if (tasks.length === 0) return;
  const allDone = tasks.every((t) => t.status === "completed");
  if (!allDone) return;
  await prisma.broadcastSession.update({ where: { id: generationId }, data: { pipelineStatus: "ready" } }).catch(() => {
  });
}
async function computeScreenBaseStatus(screenId) {
  const required = SCREEN_REQUIREMENTS[screenId];
  if (!required || required.length === 0) return null;
  const latestGen = await prisma.broadcastSession.findFirst({ orderBy: { seq: "desc" } });
  if (!latestGen) {
    return { status: "preparing", generationId: null, seq: null, progress: { completed: 0, total: required.length } };
  }
  const candidates = await prisma.broadcastSession.findMany({
    orderBy: { seq: "desc" },
    take: 5,
    include: { generationTasks: { where: { taskType: { in: required } } } }
  });
  const latestTasks = candidates.find((g) => g.id === latestGen.id)?.generationTasks ?? [];
  const completed = latestTasks.filter((t) => t.status === "completed").length;
  const failedTask = latestTasks.find((t) => t.status === "failed");
  for (const gen of candidates) {
    const isReady = required.every(
      (t) => gen.generationTasks.find((row) => row.taskType === t)?.status === "completed"
    );
    if (isReady) {
      if (gen.id === latestGen.id) {
        return { status: "current", generationId: gen.id, seq: gen.seq, progress: { completed, total: required.length } };
      }
      return {
        status: failedTask ? "failed" : "preparing",
        generationId: gen.id,
        seq: gen.seq,
        progress: { completed, total: required.length },
        failureReason: failedTask?.errorMessage ?? void 0
      };
    }
  }
  return {
    status: failedTask ? "failed" : "preparing",
    generationId: null,
    seq: null,
    progress: { completed, total: required.length },
    failureReason: failedTask?.errorMessage ?? void 0
  };
}
var import_client2, TRANSLATION_LANG_CODES, TRANSLATION_TASKS, TTS_TASKS, GREENSCREEN_TASKS, ALL_BASE_TASK_TYPES, SCREEN_REQUIREMENTS, VARIANT_SCREENS;
var init_generation = __esm({
  "lib/generation.ts"() {
    "use strict";
    import_client2 = require("@prisma/client");
    init_prisma();
    init_green_screen();
    TRANSLATION_LANG_CODES = ["de", "hi", "fr", "es"];
    TRANSLATION_TASKS = TRANSLATION_LANG_CODES.map((c) => `translation-${c}`);
    TTS_TASKS = TRANSLATION_LANG_CODES.map((c) => `tts-${c}`);
    GREENSCREEN_TASKS = GREEN_SCREEN_BACKGROUNDS.map((b) => `greenscreen-${b.id}`);
    ALL_BASE_TASK_TYPES = [
      "transcription",
      ...TRANSLATION_TASKS,
      ...TTS_TASKS,
      "highlight-analysis",
      "highlight-reel",
      ...GREENSCREEN_TASKS
    ];
    SCREEN_REQUIREMENTS = {
      4: ["transcription"],
      5: ["transcription", ...TRANSLATION_TASKS, ...TTS_TASKS],
      6: ["highlight-analysis", "highlight-reel"],
      // Screen 7 is NOT gated here: the operator can pick any background as soon
      // as *that one* composite is ready, independent of the other 4 — that's a
      // per-selection variant readiness (ScreenPublication), not an "all 5 must
      // be done" base requirement. See VARIANT_SCREENS below.
      8: ["transcription", ...TRANSLATION_TASKS, "highlight-analysis", "highlight-reel"],
      9: ["highlight-analysis", "highlight-reel"],
      10: ["highlight-analysis", "highlight-reel"],
      11: ["transcription", ...TRANSLATION_TASKS, ...TTS_TASKS, "highlight-analysis", "highlight-reel"],
      12: ["transcription", ...TRANSLATION_TASKS, ...TTS_TASKS, "highlight-analysis", "highlight-reel"]
    };
    VARIANT_SCREENS = /* @__PURE__ */ new Set([7, 11, 12]);
  }
});

// node_modules/dotenv/config.js
(function() {
  require_main().config(
    Object.assign(
      {},
      require_env_options(),
      require_cli_options()(process.argv)
    )
  );
})();

// app/worker/highlight-reel.ts
var import_bullmq2 = require("bullmq");

// lib/redis.ts
var import_ioredis = __toESM(require("ioredis"));
var globalForRedis = globalThis;
var redisConnection = globalForRedis.__redis ?? new import_ioredis.default({
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT || 6379),
  maxRetriesPerRequest: null
});
if (process.env.NODE_ENV !== "production") {
  globalForRedis.__redis = redisConnection;
}

// lib/queue.ts
var import_bullmq = require("bullmq");
init_generation();
var TRANSCRIPTION_QUEUE = "audio-transcription";
var globalForQueue = globalThis;
var transcriptionQueue = globalForQueue.__transcriptionQueue ?? new import_bullmq.Queue(TRANSCRIPTION_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5e3 },
    removeOnComplete: 50,
    removeOnFail: 100
  }
});
if (process.env.NODE_ENV !== "production") {
  globalForQueue.__transcriptionQueue = transcriptionQueue;
}
var HIGHLIGHT_ANALYSIS_QUEUE = "highlight-analysis";
var globalForHighlightAnalysisQueue = globalThis;
var highlightAnalysisQueue = globalForHighlightAnalysisQueue.__highlightAnalysisQueue ?? new import_bullmq.Queue(HIGHLIGHT_ANALYSIS_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    // Gemini calls are expensive but a failed job must never permanently
    // block a generation without at least the standard 3 attempts.
    attempts: 3,
    backoff: { type: "exponential", delay: 15e3 },
    removeOnComplete: 50,
    removeOnFail: 100
  }
});
if (process.env.NODE_ENV !== "production") {
  globalForHighlightAnalysisQueue.__highlightAnalysisQueue = highlightAnalysisQueue;
}
var HIGHLIGHT_QUEUE = "highlight-reel";
var globalForHighlightQueue = globalThis;
var highlightQueue = globalForHighlightQueue.__highlightQueue ?? new import_bullmq.Queue(HIGHLIGHT_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    // Pure ffmpeg at this point (no Gemini call), so a couple retries are cheap.
    attempts: 3,
    backoff: { type: "exponential", delay: 1e4 },
    removeOnComplete: 50,
    removeOnFail: 100
  }
});
if (process.env.NODE_ENV !== "production") {
  globalForHighlightQueue.__highlightQueue = highlightQueue;
}
var TRANSLATION_LANGUAGES = [
  { queue: "german-transcript", language: "German", langCode: "de" },
  { queue: "hindi-transcript", language: "Hindi", langCode: "hi" },
  { queue: "french-transcript", language: "French", langCode: "fr" },
  { queue: "spanish-transcript", language: "Spanish", langCode: "es" }
];
var globalForTranslationQueues = globalThis;
var translationQueues = globalForTranslationQueues.__translationQueues ?? new Map(
  TRANSLATION_LANGUAGES.map(({ queue }) => [
    queue,
    new import_bullmq.Queue(queue, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5e3 },
        removeOnComplete: 50,
        removeOnFail: 100
      }
    })
  ])
);
if (process.env.NODE_ENV !== "production") {
  globalForTranslationQueues.__translationQueues = translationQueues;
}
var AUDIO_LANGUAGES = [
  { queue: "german-audio", language: "German", langCode: "de" },
  { queue: "hindi-audio", language: "Hindi", langCode: "hi" },
  { queue: "french-audio", language: "French", langCode: "fr" },
  { queue: "spanish-audio", language: "Spanish", langCode: "es" }
];
var globalForAudioQueues = globalThis;
var audioConversionQueues = globalForAudioQueues.__audioConversionQueues ?? new Map(
  AUDIO_LANGUAGES.map(({ queue }) => [
    queue,
    new import_bullmq.Queue(queue, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5e3 },
        removeOnComplete: 50,
        removeOnFail: 100
      }
    })
  ])
);
if (process.env.NODE_ENV !== "production") {
  globalForAudioQueues.__audioConversionQueues = audioConversionQueues;
}
var GREEN_SCREEN_QUEUE = "green-screen-compose";
var globalForGreenScreenQueue = globalThis;
var greenScreenQueue = globalForGreenScreenQueue.__greenScreenQueue ?? new import_bullmq.Queue(GREEN_SCREEN_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 3e3 },
    removeOnComplete: 50,
    removeOnFail: 50
  }
});
var BG_QUEUE_CONCURRENCY = parseInt(process.env.BG_QUEUE_CONCURRENCY || "5", 10);
greenScreenQueue.setGlobalConcurrency(BG_QUEUE_CONCURRENCY).catch(() => {
});
if (process.env.NODE_ENV !== "production") {
  globalForGreenScreenQueue.__greenScreenQueue = greenScreenQueue;
}
var VIDEO_EXPORT_QUEUE = "video-export";
var globalForVideoExportQueue = globalThis;
var videoExportQueue = globalForVideoExportQueue.__videoExportQueue ?? new import_bullmq.Queue(VIDEO_EXPORT_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 15e3 },
    removeOnComplete: 50,
    removeOnFail: 100
  }
});
if (process.env.NODE_ENV !== "production") {
  globalForVideoExportQueue.__videoExportQueue = videoExportQueue;
}

// lib/highlight-reel.ts
var import_promises = require("node:fs/promises");
var import_node_os = require("node:os");
var import_node_path = require("node:path");
init_prisma();
init_minio();

// lib/gemini.ts
var GEMINI_API_BASE = (process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
var GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
console.log(`[GEMINI_MODEL CONFIG] Active model: ${GEMINI_MODEL}`);
var GENERATE_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 9e5);

// lib/ffmpeg.ts
var import_node_child_process = require("node:child_process");
var FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg";
var FFPROBE_BIN = process.env.FFPROBE_PATH || "ffprobe";
var FFMPEG_THREADS = parseInt(process.env.FFMPEG_THREADS || "2", 10);
var TARGET_WIDTH = 1280;
var TARGET_HEIGHT = 720;
var TARGET_FPS = 30;
var TARGET_SAMPLE_RATE = 48e3;
function run(bin, args, cwd, timeoutMs, onHeartbeat) {
  return new Promise((resolve, reject) => {
    const child = (0, import_node_child_process.spawn)(bin, args, { cwd, windowsHide: true });
    const startedAt = Date.now();
    if (onHeartbeat && child.pid) onHeartbeat(child.pid);
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timer;
    let heartbeat;
    if (timeoutMs || onHeartbeat) {
      heartbeat = setInterval(() => {
        console.log(`[ffmpeg] "${bin}" still running after ${Math.round((Date.now() - startedAt) / 1e3)}s`);
        if (onHeartbeat && child.pid) onHeartbeat(child.pid);
      }, 3e4);
    }
    if (timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);
    }
    const clearTimers = () => {
      if (timer) clearTimeout(timer);
      if (heartbeat) clearInterval(heartbeat);
    };
    child.stdout.on("data", (d) => stdout += d.toString());
    child.stderr.on("data", (d) => stderr += d.toString());
    child.on("error", (err) => {
      clearTimers();
      if (err.code === "ENOENT") {
        reject(
          new Error(
            `"${bin}" not found. Install ffmpeg (it ships ffprobe too) and put it on PATH, or set FFMPEG_PATH / FFPROBE_PATH in .env.`
          )
        );
        return;
      }
      reject(err);
    });
    child.on("close", (code) => {
      clearTimers();
      if (timedOut) {
        reject(new Error(`${bin} timed out after ${Math.round(timeoutMs / 6e4)} minutes and was killed`));
        return;
      }
      if (code === 0) resolve(stdout);
      else reject(new Error(`${bin} exited ${code}: ${stderr.trim().slice(-800)}`));
    });
  });
}
async function probeStreamDurations(file) {
  const out = await run(FFPROBE_BIN, [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type,duration:format=duration",
    "-of",
    "json",
    file
  ]);
  const parsed = JSON.parse(out);
  const format = Number(parsed.format?.duration);
  let video = null;
  let audio = null;
  for (const stream of parsed.streams || []) {
    const duration = Number(stream.duration);
    const value = Number.isFinite(duration) && duration > 0 ? duration : null;
    if (stream.codec_type === "video" && video == null) video = value;
    if (stream.codec_type === "audio" && audio == null) audio = value;
  }
  const fallback = Number.isFinite(format) && format > 0 ? format : null;
  return {
    video: video ?? fallback,
    audio: audio ?? fallback,
    format: fallback
  };
}
async function extractNormalizedClip(opts) {
  const { input, start, end, output, withSilentAudio, cwd, timeoutMs, onHeartbeat } = opts;
  const duration = end - start;
  const args = [
    "-y",
    "-ss",
    start.toFixed(3),
    "-t",
    duration.toFixed(3),
    "-i",
    input
  ];
  if (withSilentAudio) {
    args.push(
      "-f",
      "lavfi",
      "-t",
      duration.toFixed(3),
      "-i",
      `anullsrc=channel_layout=stereo:sample_rate=${TARGET_SAMPLE_RATE}`,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0"
    );
  } else {
    args.push("-map", "0:v:0", "-map", "0:a:0");
  }
  args.push(
    "-vf",
    `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease,pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2,fps=${TARGET_FPS},format=yuv420p`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-threads",
    String(FFMPEG_THREADS),
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    String(TARGET_SAMPLE_RATE),
    "-ac",
    "2",
    "-shortest",
    output
  );
  await run(FFMPEG_BIN, args, cwd, timeoutMs, onHeartbeat);
}
async function extractSyncedHighlightClip(opts) {
  const { videoInput, audioInput, start, end, output, cwd, timeoutMs, onHeartbeat } = opts;
  const duration = end - start;
  const fadeSeconds = Math.min(0.01, duration / 4);
  const fadeOutStart = Math.max(0, duration - fadeSeconds);
  const filter = `[0:v]trim=start=${start.toFixed(3)}:end=${end.toFixed(3)},setpts=PTS-STARTPTS,scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease,pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2,fps=${TARGET_FPS},format=yuv420p[v];[1:a]atrim=start=${start.toFixed(3)}:end=${end.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${fadeSeconds.toFixed(3)},afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeSeconds.toFixed(3)},aresample=${TARGET_SAMPLE_RATE},aformat=channel_layouts=stereo[a]`;
  await run(
    FFMPEG_BIN,
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      videoInput,
      "-i",
      audioInput,
      "-filter_complex",
      filter,
      "-map",
      "[v]",
      "-map",
      "[a]",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-threads",
      String(FFMPEG_THREADS),
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ar",
      String(TARGET_SAMPLE_RATE),
      "-ac",
      "2",
      "-shortest",
      output
    ],
    cwd,
    timeoutMs,
    onHeartbeat
  );
}
async function concatClips(clips, output, cwd, listFilename = "concat-list.txt", timeoutMs, onHeartbeat) {
  const { writeFile } = await import("node:fs/promises");
  const { join: join2 } = await import("node:path");
  await writeFile(
    join2(cwd, listFilename),
    clips.map((c) => `file '${c}'`).join("\n") + "\n",
    "utf-8"
  );
  await run(
    FFMPEG_BIN,
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFilename,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      output
    ],
    cwd,
    timeoutMs,
    onHeartbeat
  );
}

// lib/highlight-reel.ts
init_camera_recordings();
var FFMPEG_HIGHLIGHT_TIMEOUT_MS = parseInt(
  process.env.FFMPEG_HIGHLIGHT_TIMEOUT_MS || String(8 * 60 * 1e3),
  10
);
var SYNC_TOLERANCE_SECONDS = 0.15;
async function findMasterAudio(generationId) {
  if (!generationId) return null;
  return prisma.audioFile.findFirst({
    where: {
      sessionId: generationId,
      filename: { not: "master-audio-16k.wav" }
    },
    orderBy: { createdAt: "desc" }
  });
}
function assertSyncedDurations(label, durations) {
  if (durations.video == null) {
    throw new Error(`${label} has no video duration`);
  }
  if (durations.audio == null) {
    throw new Error(`${label} has no audio duration`);
  }
  const difference = Math.abs(durations.video - durations.audio);
  if (difference > SYNC_TOLERANCE_SECONDS) {
    throw new Error(
      `${label} audio/video duration mismatch: video=${durations.video.toFixed(3)}s audio=${durations.audio.toFixed(3)}s diff=${difference.toFixed(3)}s`
    );
  }
}
async function renderHighlightReel(cam1Filename, cam2Filename, cam3Filename, analysis, generationId, opts) {
  const { title, segments, audio } = analysis;
  const { timeoutMs, onHeartbeat } = opts || {};
  const workDir = await (0, import_promises.mkdtemp)((0, import_node_path.join)((0, import_node_os.tmpdir)(), "highlight-render-"));
  try {
    const masterAudio = await findMasterAudio(generationId);
    const masterAudioPath = masterAudio ? (0, import_node_path.join)(workDir, `master-${masterAudio.objectKey || masterAudio.filename}`) : null;
    const sources = {
      1: (0, import_node_path.join)(workDir, `cam1-${cam1Filename}`),
      2: (0, import_node_path.join)(workDir, `cam2-${cam2Filename}`),
      3: (0, import_node_path.join)(workDir, `cam3-${cam3Filename}`)
    };
    await Promise.all([
      downloadObjectToFile(VIDEO_BUCKET, cam1Filename, sources[1]),
      downloadObjectToFile(VIDEO_BUCKET, cam2Filename, sources[2]),
      downloadObjectToFile(VIDEO_BUCKET, cam3Filename, sources[3]),
      ...masterAudio && masterAudioPath ? [downloadObjectToFile(AUDIO_BUCKET, masterAudio.objectKey || masterAudio.filename, masterAudioPath)] : []
    ]);
    if (!masterAudioPath) {
      console.warn(
        `[highlight-reel] No master audio found for generation ${generationId || "(none)"}; falling back to camera audio/silence.`
      );
    }
    const clips = [];
    for (const [index, segment] of segments.entries()) {
      const clip = `clip-${String(index).padStart(3, "0")}.mp4`;
      const expectedDuration = segment.end - segment.start;
      console.log({
        segmentNumber: index + 1,
        camera: segment.camera,
        sessionStart: segment.start,
        sessionEnd: segment.end,
        cameraOffset: 0,
        videoStart: segment.start,
        videoEnd: segment.end,
        audioOffset: 0,
        audioStart: segment.start,
        audioEnd: segment.end,
        expectedDuration
      });
      if (masterAudioPath) {
        await extractSyncedHighlightClip({
          videoInput: sources[segment.camera],
          audioInput: masterAudioPath,
          start: segment.start,
          end: segment.end,
          output: clip,
          cwd: workDir,
          timeoutMs,
          onHeartbeat
        });
      } else {
        await extractNormalizedClip({
          input: sources[segment.camera],
          start: segment.start,
          end: segment.end,
          output: clip,
          withSilentAudio: !audio[segment.camera],
          cwd: workDir,
          timeoutMs,
          onHeartbeat
        });
      }
      const clipDurations = await probeStreamDurations((0, import_node_path.join)(workDir, clip));
      console.log({
        segmentNumber: index + 1,
        videoDuration: clipDurations.video,
        audioDuration: clipDurations.audio,
        difference: clipDurations.video != null && clipDurations.audio != null ? Math.abs(clipDurations.video - clipDurations.audio) : null
      });
      assertSyncedDurations(`highlight segment ${index + 1}`, clipDurations);
      clips.push(clip);
    }
    const reelFilename = highlightFilenameFor(cam1Filename);
    const reelPath = (0, import_node_path.join)(workDir, "highlight.mp4");
    await concatClips(clips, "highlight.mp4", workDir, void 0, timeoutMs, onHeartbeat);
    const finalDurations = await probeStreamDurations(reelPath);
    assertSyncedDurations("final highlight reel", finalDurations);
    const reelBytes = await (0, import_promises.readFile)(reelPath);
    await uploadObject(VIDEO_BUCKET, reelFilename, reelBytes, "video/mp4");
    const url = `/api/asset/${VIDEO_BUCKET}/${encodeURIComponent(reelFilename)}`;
    await prisma.videoRecording.upsert({
      where: { filename: reelFilename },
      create: {
        filename: reelFilename,
        url,
        bucket: VIDEO_BUCKET,
        objectKey: reelFilename,
        contentType: "video/mp4",
        size: reelBytes.length,
        sessionId: generationId
      },
      update: { url, size: reelBytes.length, contentType: "video/mp4", sessionId: generationId }
    });
    const sidecarKey = `${reelFilename}.json`;
    await uploadObject(
      TRANSCRIPTS_BUCKET,
      sidecarKey,
      Buffer.from(
        JSON.stringify(
          {
            title,
            model: GEMINI_MODEL,
            sessionId: generationId ?? null,
            masterAudio: masterAudio ? {
              filename: masterAudio.filename,
              objectKey: masterAudio.objectKey || masterAudio.filename,
              url: masterAudio.url
            } : null,
            sync: {
              camera1Offset: 0,
              camera2Offset: 0,
              camera3Offset: 0,
              audioOffset: 0
            },
            sources: [cam1Filename, cam2Filename, cam3Filename],
            segments,
            validation: {
              videoDuration: finalDurations.video,
              audioDuration: finalDurations.audio,
              difference: finalDurations.video != null && finalDurations.audio != null ? Math.abs(finalDurations.video - finalDurations.audio) : null
            }
          },
          null,
          2
        ),
        "utf-8"
      ),
      "application/json"
    );
    const durationSeconds = segments.reduce((sum, s) => sum + (s.end - s.start), 0);
    return {
      filename: reelFilename,
      url,
      size: reelBytes.length,
      durationSeconds: Number(durationSeconds.toFixed(2)),
      segments,
      title,
      model: GEMINI_MODEL
    };
  } finally {
    await (0, import_promises.rm)(workDir, { recursive: true, force: true });
  }
}

// app/worker/highlight-reel.ts
init_generation();

// lib/generation-heartbeat.ts
init_prisma();
var DEFAULT_INTERVAL_MS = parseInt(process.env.WATCHDOG_HEARTBEAT_INTERVAL_MS || "30000", 10);
var NOOP_HEARTBEAT = { touch() {
}, stop: async () => {
} };
function startHeartbeat(opts) {
  const { generationId, taskType, jobId, intervalMs = DEFAULT_INTERVAL_MS } = opts;
  if (!generationId) return NOOP_HEARTBEAT;
  let progressPercent;
  let progressMessage;
  let processId = opts.processId;
  const write = async () => {
    await prisma.generationTask.updateMany({
      where: { generationId, taskType },
      data: { lastHeartbeatAt: /* @__PURE__ */ new Date(), progressPercent, progressMessage, processId }
    }).catch((err) => {
      console.error(`[heartbeat] write failed for task=${taskType}:`, err);
    });
  };
  void write();
  const timer = setInterval(write, intervalMs);
  return {
    touch(percent, message) {
      progressPercent = percent;
      progressMessage = message;
    },
    async stop() {
      clearInterval(timer);
      await write();
    }
  };
}

// app/worker/highlight-reel.ts
var WORKER_NAME = "highlight-reel-worker";
var LOCK_DURATION_MS = FFMPEG_HIGHLIGHT_TIMEOUT_MS + 2 * 60 * 1e3;
var worker = new import_bullmq2.Worker(
  HIGHLIGHT_QUEUE,
  async (job) => {
    const { cam1Filename, cam2Filename, cam3Filename, title, segments, audio, generationId } = job.data;
    await markTaskProcessing(generationId, "highlight-reel", job.id);
    console.log(
      `[${WORKER_NAME}] job ${job.id} \u2192 cutting "${cam1Filename}" + "${cam2Filename}" + "${cam3Filename}" (${segments.length} segment(s) from stage 1)`
    );
    const heartbeat = startHeartbeat({ generationId, taskType: "highlight-reel", jobId: job.id });
    let result;
    try {
      result = await renderHighlightReel(
        cam1Filename,
        cam2Filename,
        cam3Filename,
        {
          title,
          segments,
          audio
        },
        generationId,
        {
          timeoutMs: FFMPEG_HIGHLIGHT_TIMEOUT_MS,
          onHeartbeat: (pid) => heartbeat.touch(void 0, `ffmpeg pid ${pid}`)
        }
      );
      await heartbeat.stop();
    } catch (err) {
      await heartbeat.stop();
      throw err;
    }
    console.log(
      `[${WORKER_NAME}] job ${job.id} done: "${result.title}" \u2014 ${result.segments.length} segment(s), ${result.durationSeconds}s \u2192 ${result.url}`
    );
    await markTaskCompleted(generationId, "highlight-reel");
    return {
      filename: result.filename,
      url: result.url,
      size: result.size,
      durationSeconds: result.durationSeconds,
      segments: result.segments.length,
      model: result.model
    };
  },
  {
    name: WORKER_NAME,
    connection: redisConnection,
    // Pure x264 re-encode is heavy; one session at a time.
    concurrency: 1,
    lockDuration: LOCK_DURATION_MS
  }
);
worker.on("ready", () => {
  console.log(`[${WORKER_NAME}] ready and listening on queue "${HIGHLIGHT_QUEUE}"`);
});
worker.on("active", (job) => {
  console.log(`[${WORKER_NAME}] processing job ${job.id}`);
});
worker.on("completed", (job) => {
  console.log(`[${WORKER_NAME}] \u2705 completed job ${job.id}`);
});
worker.on("failed", async (job, err) => {
  console.error(`[${WORKER_NAME}] \u274C job ${job?.id} failed: ${err.message}`);
  await markTaskFailed(
    job?.data?.generationId,
    "highlight-reel",
    err.message,
    job?.attemptsMade ?? 1,
    job?.opts?.attempts ?? 3,
    job?.id
  );
});
worker.on("error", (err) => {
  console.error(`[${WORKER_NAME}] worker error: ${err.message}`);
});
async function shutdown() {
  console.log(`[${WORKER_NAME}] shutting down\u2026`);
  await worker.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

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
var CAMERA_FILENAME_PREFIX;
var init_camera_recordings = __esm({
  "lib/camera-recordings.ts"() {
    "use strict";
    CAMERA_FILENAME_PREFIX = {
      1: "camera-recording-",
      2: "camera2-recording-",
      3: "camera3-recording-"
    };
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
async function upsertTaskPending(generationId, taskType, jobId, payload) {
  if (!generationId) return null;
  return prisma.generationTask.upsert({
    where: { generationId_taskType: { generationId, taskType } },
    create: { generationId, taskType, status: "pending", jobId, payload },
    update: { jobId, status: "pending", errorMessage: null, payload }
  });
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

// app/worker/highlight-analysis.ts
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
async function enqueueHighlightReel(cam1Filename, cam2Filename, cam3Filename, analysis, generationId) {
  const jobId = `highlight-${cam1Filename}`;
  const existing = await highlightQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "completed" || state === "failed") {
      await existing.remove().catch(() => {
      });
    }
  }
  await upsertTaskPending(generationId, "highlight-reel", jobId, {
    cam1Filename,
    cam2Filename,
    cam3Filename,
    ...analysis,
    generationId
  });
  return highlightQueue.add(
    "build-reel",
    { cam1Filename, cam2Filename, cam3Filename, ...analysis, generationId },
    { jobId }
  );
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

// lib/highlight-analysis.ts
var import_promises = require("node:fs/promises");
var import_node_os = require("node:os");
var import_node_path = require("node:path");
init_minio();

// lib/gemini.ts
var GEMINI_API_BASE = (process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
var GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
console.log(`[GEMINI_MODEL CONFIG] Active model: ${GEMINI_MODEL}`);
var GENERATE_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 9e5);
var FILE_ACTIVE_TIMEOUT_MS = 6e5;
var FILE_POLL_INTERVAL_MS = 3e3;
function apiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set \u2014 add it to .env before running this worker.");
  }
  return key;
}
async function readError(res) {
  const body = await res.text().catch(() => "");
  return `${res.status} ${res.statusText}${body ? ` \u2014 ${body.slice(0, 500)}` : ""}`;
}
async function uploadFile(bytes, mimeType, displayName) {
  const startRes = await fetch(`${GEMINI_API_BASE}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey(),
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ file: { display_name: displayName } })
  });
  if (!startRes.ok) {
    throw new Error(`Gemini upload start failed: ${await readError(startRes)}`);
  }
  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new Error("Gemini upload start returned no x-goog-upload-url header");
  }
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bytes.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize"
    },
    body: new Uint8Array(bytes)
  });
  if (!uploadRes.ok) {
    throw new Error(`Gemini upload failed: ${await readError(uploadRes)}`);
  }
  const { file } = await uploadRes.json();
  if (!file?.name || !file?.uri) {
    throw new Error("Gemini upload returned no file handle");
  }
  return { name: file.name, uri: file.uri, mimeType: file.mimeType || mimeType };
}
async function waitUntilActive(file) {
  const deadline = Date.now() + FILE_ACTIVE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(`${GEMINI_API_BASE}/v1beta/${file.name}`, {
      headers: { "x-goog-api-key": apiKey() }
    });
    if (!res.ok) throw new Error(`Gemini file poll failed: ${await readError(res)}`);
    const state = (await res.json()).state;
    if (state === "ACTIVE") return;
    if (state === "FAILED") throw new Error(`Gemini failed to process ${file.name}`);
    await new Promise((resolve) => setTimeout(resolve, FILE_POLL_INTERVAL_MS));
  }
  throw new Error(`Gemini file ${file.name} was still processing after 10 minutes`);
}
async function deleteFile(file) {
  try {
    await fetch(`${GEMINI_API_BASE}/v1beta/${file.name}`, {
      method: "DELETE",
      headers: { "x-goog-api-key": apiKey() }
    });
  } catch (err) {
    console.warn(`Could not delete Gemini file ${file.name}: ${err.message}`);
  }
}
function filePart(file) {
  return { file_data: { mime_type: file.mimeType, file_uri: file.uri } };
}
async function generateJson(parts, responseSchema) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${GEMINI_API_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": apiKey(), "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: 0.3,
            responseMimeType: "application/json",
            responseSchema
          }
        }),
        signal: controller.signal
      }
    );
    if (!res.ok) throw new Error(`Gemini generateContent failed: ${await readError(res)}`);
    const body = await res.json();
    const candidate = body.candidates?.[0];
    const text = (candidate?.content?.parts || []).filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("");
    if (!text.trim()) {
      throw new Error(
        `Gemini returned no text (finishReason: ${candidate?.finishReason || "unknown"})`
      );
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timeoutId);
  }
}

// lib/ffmpeg.ts
var import_node_child_process = require("node:child_process");
var FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg";
var FFPROBE_BIN = process.env.FFPROBE_PATH || "ffprobe";
var FFMPEG_THREADS = parseInt(process.env.FFMPEG_THREADS || "2", 10);
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
async function probeDurationSeconds(file) {
  const out = await run(FFPROBE_BIN, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file
  ]);
  const duration = Number(out.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not read a duration from "${file}"`);
  }
  return duration;
}
async function hasAudioStream(file) {
  const out = await run(FFPROBE_BIN, [
    "-v",
    "error",
    "-select_streams",
    "a",
    "-show_entries",
    "stream=index",
    "-of",
    "csv=p=0",
    file
  ]);
  return out.trim().length > 0;
}

// lib/highlight-analysis.ts
var MIN_SEGMENT_SECONDS = 2;
var MAX_SEGMENT_SECONDS = 20;
var MAX_SEGMENTS = 8;
var MAX_REEL_SECONDS = 90;
var HIGHLIGHT_ANALYSIS_TIMEOUT_MS = parseInt(
  process.env.HIGHLIGHT_ANALYSIS_TIMEOUT_MS || String(5 * 60 * 1e3),
  10
);
function withAbortTimeout(fn, timeoutMs, label) {
  const controller = new AbortController();
  const timedOut = new Promise((_, reject) => {
    controller.signal.addEventListener("abort", () => {
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 6e4)} minutes`));
    });
  });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return Promise.race([fn(), timedOut]).finally(() => clearTimeout(timer));
}
var RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING", description: "Short headline for the reel" },
    segments: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          camera: { type: "INTEGER", description: "1 for CAMERA 01, 2 for CAMERA 02, 3 for CAMERA 03" },
          start: { type: "NUMBER", description: "Start time in seconds" },
          end: { type: "NUMBER", description: "End time in seconds" },
          reason: { type: "STRING", description: "Why this moment is engaging" }
        },
        required: ["camera", "start", "end", "reason"]
      }
    }
  },
  required: ["title", "segments"]
};
function buildPrompt(durations) {
  return [
    "You are a broadcast editor cutting a highlight reel for a news studio.",
    "",
    "You are given the SAME recording session from three angles, filmed simultaneously:",
    `- VIDEO A = CAMERA 01 (${durations[1].toFixed(1)}s, carries the studio audio)`,
    `- VIDEO B = CAMERA 02 (${durations[2].toFixed(1)}s, second angle, no audio)`,
    `- VIDEO C = CAMERA 03 (${durations[3].toFixed(1)}s, third angle, no audio)`,
    "",
    "All three camera videos show the same synchronized session timeline.",
    "Your start/end timestamps must refer to the COMMON SESSION TIMELINE.",
    'The "camera" field only determines which camera angle should be displayed.',
    "The matching master audio from that same session time range will be used",
    "automatically during rendering. Do not compensate for audio synchronization",
    "yourself; only choose editorially appropriate camera angles and time ranges.",
    "",
    "Pick the most engaging seconds of the session: the strongest delivery, the",
    "clearest statements, visible reactions and gestures, and moments where the",
    "second or third angle is more interesting than the first. Skip dead air, fumbles,",
    "long pauses, and anything before the presenter settles.",
    "",
    "Rules:",
    `- Return between 3 and ${MAX_SEGMENTS} segments.`,
    `- Each segment must be between ${MIN_SEGMENT_SECONDS} and ${MAX_SEGMENT_SECONDS} seconds long.`,
    `- The segments must total no more than ${MAX_REEL_SECONDS} seconds.`,
    "- Order the segments chronologically and do not overlap them in time.",
    "- Cut between the three cameras where it makes the reel more watchable.",
    '- "start" and "end" are seconds from the beginning of the common session',
    "  timeline, as numbers (e.g. 12.5), never as MM:SS text.",
    "- Every timestamp must be inside the listed duration for the selected camera."
  ].join("\n");
}
function sanitizeSegments(raw, durations) {
  const kept = [];
  let total = 0;
  const ordered = [...raw].sort((a, b) => a.start - b.start);
  for (const segment of ordered) {
    const camera = segment.camera === 2 ? 2 : segment.camera === 3 ? 3 : 1;
    const limit = durations[camera];
    const start = Math.max(0, Math.min(Number(segment.start), limit));
    let end = Math.max(0, Math.min(Number(segment.end), limit));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < MIN_SEGMENT_SECONDS) {
      continue;
    }
    if (end - start > MAX_SEGMENT_SECONDS) end = start + MAX_SEGMENT_SECONDS;
    const previous = kept[kept.length - 1];
    if (previous && start < previous.end && camera === previous.camera) continue;
    const length = end - start;
    if (total + length > MAX_REEL_SECONDS) break;
    kept.push({ camera, start, end, reason: String(segment.reason || "").trim() });
    total += length;
    if (kept.length >= MAX_SEGMENTS) break;
  }
  return kept;
}
async function selectSegments(files, durations) {
  const uploaded = [];
  try {
    for (const file of files) {
      const bytes = await (0, import_promises.readFile)(file.path);
      const handle = await uploadFile(bytes, "video/mp4", file.filename);
      await waitUntilActive(handle);
      uploaded.push({ cameraId: file.cameraId, handle });
    }
    const parts = [];
    for (const { cameraId, handle } of uploaded) {
      let label = "VIDEO A \u2014 CAMERA 01:";
      if (cameraId === 2) label = "VIDEO B \u2014 CAMERA 02:";
      if (cameraId === 3) label = "VIDEO C \u2014 CAMERA 03:";
      parts.push({ text: label });
      parts.push(filePart(handle));
    }
    parts.push({ text: buildPrompt(durations) });
    const result = await generateJson(
      parts,
      RESPONSE_SCHEMA
    );
    return {
      title: String(result.title || "Studio highlights").trim(),
      segments: Array.isArray(result.segments) ? result.segments : []
    };
  } finally {
    await Promise.all(uploaded.map(({ handle }) => deleteFile(handle)));
  }
}
async function analyzeHighlightSegments(cam1Filename, cam2Filename, cam3Filename) {
  const workDir = await (0, import_promises.mkdtemp)((0, import_node_path.join)((0, import_node_os.tmpdir)(), "highlight-analysis-"));
  try {
    const sources = {
      1: (0, import_node_path.join)(workDir, `cam1-${cam1Filename}`),
      2: (0, import_node_path.join)(workDir, `cam2-${cam2Filename}`),
      3: (0, import_node_path.join)(workDir, `cam3-${cam3Filename}`)
    };
    await Promise.all([
      downloadObjectToFile(VIDEO_BUCKET, cam1Filename, sources[1]),
      downloadObjectToFile(VIDEO_BUCKET, cam2Filename, sources[2]),
      downloadObjectToFile(VIDEO_BUCKET, cam3Filename, sources[3])
    ]);
    const durations = {
      1: await probeDurationSeconds(sources[1]),
      2: await probeDurationSeconds(sources[2]),
      3: await probeDurationSeconds(sources[3])
    };
    const audio = {
      1: await hasAudioStream(sources[1]),
      2: await hasAudioStream(sources[2]),
      3: await hasAudioStream(sources[3])
    };
    const { title, segments: proposed } = await withAbortTimeout(
      () => selectSegments(
        [
          { cameraId: 1, path: sources[1], filename: cam1Filename },
          { cameraId: 2, path: sources[2], filename: cam2Filename },
          { cameraId: 3, path: sources[3], filename: cam3Filename }
        ],
        durations
      ),
      HIGHLIGHT_ANALYSIS_TIMEOUT_MS,
      "Gemini call"
    );
    const segments = sanitizeSegments(proposed, durations);
    if (segments.length === 0) {
      throw new Error(
        `Gemini returned no usable segments for "${cam1Filename}" / "${cam2Filename}" / "${cam3Filename}" (${proposed.length} proposed, all outside the clip bounds or too short)`
      );
    }
    const reelFilenameHint = `${cam1Filename}.analysis`;
    await uploadObject(
      TRANSCRIPTS_BUCKET,
      `${reelFilenameHint}.json`,
      Buffer.from(
        JSON.stringify(
          { title, model: GEMINI_MODEL, sources: [cam1Filename, cam2Filename, cam3Filename], segments, audio },
          null,
          2
        ),
        "utf-8"
      ),
      "application/json"
    );
    return { title, segments, audio };
  } finally {
    await (0, import_promises.rm)(workDir, { recursive: true, force: true });
  }
}

// app/worker/highlight-analysis.ts
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

// app/worker/highlight-analysis.ts
var WORKER_NAME = "highlight-analysis-worker";
var LOCK_DURATION_MS = HIGHLIGHT_ANALYSIS_TIMEOUT_MS + 2 * 60 * 1e3;
var worker = new import_bullmq2.Worker(
  HIGHLIGHT_ANALYSIS_QUEUE,
  async (job) => {
    const { cam1Filename, cam2Filename, cam3Filename, generationId } = job.data;
    await markTaskProcessing(generationId, "highlight-analysis", job.id);
    console.log(
      `[${WORKER_NAME}] job ${job.id} \u2192 analyzing "${cam1Filename}" + "${cam2Filename}" + "${cam3Filename}"`
    );
    const heartbeat = startHeartbeat({ generationId, taskType: "highlight-analysis", jobId: job.id });
    let analysis;
    try {
      analysis = await analyzeHighlightSegments(cam1Filename, cam2Filename, cam3Filename);
      await heartbeat.stop();
    } catch (err) {
      await heartbeat.stop();
      throw err;
    }
    console.log(
      `[${WORKER_NAME}] job ${job.id} done: "${analysis.title}" \u2014 ${analysis.segments.length} segment(s)`
    );
    for (const segment of analysis.segments) {
      console.log(
        `[${WORKER_NAME}]   cam${segment.camera} ${segment.start.toFixed(1)}s\u2013${segment.end.toFixed(1)}s: ${segment.reason}`
      );
    }
    await enqueueHighlightReel(cam1Filename, cam2Filename, cam3Filename, analysis, generationId);
    await markTaskCompleted(generationId, "highlight-analysis");
    return {
      title: analysis.title,
      segments: analysis.segments.length
    };
  },
  {
    name: WORKER_NAME,
    connection: redisConnection,
    // Gemini upload + inference is the expensive part; one session at a time.
    concurrency: 1,
    // A long take can spend minutes in Gemini alone.
    lockDuration: LOCK_DURATION_MS
  }
);
worker.on("ready", () => {
  console.log(`[${WORKER_NAME}] ready and listening on queue "${HIGHLIGHT_ANALYSIS_QUEUE}"`);
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
    "highlight-analysis",
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

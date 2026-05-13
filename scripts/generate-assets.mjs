import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const appRoot = join(root, "..");
const assetsRoot = join(appRoot, "..", "Assets");
const outFile = join(appRoot, "src", "assetManifest.js");
const publicRoot = join(appRoot, "public");

function filesIn(pathParts, extensions) {
  return filesInDir(join(assetsRoot, ...pathParts), extensions);
}

function filesInDir(dir, extensions) {
  try {
    return readdirSync(dir)
      .filter((name) => {
        const full = join(dir, name);
        return statSync(full).isFile() && extensions.some((ext) => name.toLowerCase().endsWith(ext));
      })
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  } catch {
    return [];
  }
}

function recursiveFiles(pathParts, extensions) {
  const dir = join(assetsRoot, ...pathParts);
  return recursiveFilesFromDir(dir, extensions);
}

function recursiveFilesFromDir(dir, extensions) {
  const found = [];
  function walk(current) {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      const stats = statSync(full);
      if (stats.isDirectory()) walk(full);
      else if (extensions.some((ext) => name.toLowerCase().endsWith(ext))) {
        found.push(relative(dir, full).replaceAll("\\", "/"));
      }
    }
  }
  try {
    if (!existsSync(dir)) return [];
    walk(dir);
  } catch {
    return [];
  }
  return found.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

const soundImports = [];

function safeSoundName(name) {
  return name.replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "") || "sound";
}

function uniqueSafeFileName(file, used) {
  const dot = file.lastIndexOf(".");
  const stem = dot >= 0 ? file.slice(0, dot) : file;
  const ext = dot >= 0 ? file.slice(dot) : "";
  const safeStem = safeSoundName(stem);
  const safeExt = ext.replace(/[^a-z0-9.]+/gi, "_");
  let safe = `${safeStem}${safeExt}`;
  let index = 2;
  while (used.has(safe.toLowerCase())) {
    safe = `${safeStem}-${index}${safeExt}`;
    index += 1;
  }
  used.add(safe.toLowerCase());
  return safe;
}

function generatedPublicFiles(pathParts, extensions) {
  const files = filesIn(pathParts, extensions);
  const outDir = join(publicRoot, ...pathParts);
  if (!files.length) return filesInDir(outDir, extensions);
  mkdirSync(outDir, { recursive: true });
  return files.map((file) => {
    const source = join(assetsRoot, ...pathParts, file);
    const target = join(outDir, file);
    const sourceStats = statSync(source);
    if (sourceStats.size <= 0) return null;
    if (existsSync(target)) {
      const targetStats = statSync(target);
      if (targetStats.size === sourceStats.size && targetStats.mtimeMs >= sourceStats.mtimeMs) return file;
    }
    copyFileSync(source, target);
    return file;
  }).filter(Boolean);
}

function copySourceTreeToPublic(pathParts, extensions) {
  const sourceDir = join(assetsRoot, ...pathParts);
  const outDir = join(publicRoot, ...pathParts);
  const files = recursiveFilesFromDir(sourceDir, extensions);
  if (!files.length) return;
  mkdirSync(outDir, { recursive: true });
  files.forEach((file) => {
    const source = join(sourceDir, ...file.split("/"));
    const target = join(outDir, ...file.split("/"));
    const sourceStats = statSync(source);
    if (sourceStats.size <= 0) return;
    mkdirSync(dirname(target), { recursive: true });
    if (existsSync(target)) {
      const targetStats = statSync(target);
      if (targetStats.size === sourceStats.size && targetStats.mtimeMs >= sourceStats.mtimeMs) return;
    }
    copyFileSync(source, target);
  });
}

function fileContentKey(file) {
  try {
    const stats = statSync(file);
    const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
    return `${stats.size}:${hash}`;
  } catch {
    return null;
  }
}

function generatedPublicMediaFiles(pathParts, extensions) {
  copySourceTreeToPublic(pathParts, extensions);
  const outDir = join(publicRoot, ...pathParts);
  const seenContent = new Set();
  return recursiveFilesFromDir(outDir, extensions)
    .filter((file) => {
      const full = join(outDir, ...file.split("/"));
      const stats = statSync(full);
      if (stats.size <= 0) return false;
      const key = fileContentKey(full);
      if (!key) return false;
      if (seenContent.has(key)) return false;
      seenContent.add(key);
      return true;
    });
}

function assetRef(name) {
  return { __assetRef: name };
}

function generatedSoundFiles(pathParts, outputName) {
  const files = filesIn(pathParts, [".wav", ".mp3", ".ogg"]);
  const outDir = join(appRoot, "src", "__generated_sounds", outputName);
  if (files.length) {
    mkdirSync(outDir, { recursive: true });
    files.forEach((file, index) => {
      const safeName = `${String(index + 1).padStart(2, "0")}-${safeSoundName(file)}`;
      const source = join(assetsRoot, ...pathParts, file);
      const destination = join(outDir, safeName);
      const sourceSize = statSync(source).size;
      if (sourceSize <= 0) return;
      if (existsSync(destination)) {
        const destinationSize = statSync(destination).size;
        if (destinationSize === sourceSize && fileContentKey(destination)) return;
      }
      try {
        copyFileSync(source, destination);
      } catch (error) {
        if (error?.code === "EPERM") {
          const destinationSize = existsSync(destination) ? statSync(destination).size : -1;
          if (sourceSize > 0 && sourceSize === destinationSize) return;
          try {
            writeFileSync(destination, readFileSync(source));
            return;
          } catch {
            const dot = safeName.lastIndexOf(".");
            const base = dot >= 0 ? safeName.slice(0, dot) : safeName;
            const ext = dot >= 0 ? safeName.slice(dot) : "";
            for (let attempt = 1; attempt <= 5; attempt += 1) {
              const altName = `${base}-copy${attempt === 1 ? "" : attempt}${ext}`;
              const altDestination = join(outDir, altName);
              try {
                copyFileSync(source, altDestination);
                return;
              } catch {
                try {
                  writeFileSync(altDestination, readFileSync(source));
                  return;
                } catch {
                  // Try the next alternate name; Windows can briefly lock generated audio files.
                }
              }
            }
          }
        }
        throw error;
      }
    });
  }
  return filesInDir(outDir, [".wav", ".mp3", ".ogg"]).filter((safeName) => {
    const full = join(outDir, safeName);
    const stats = statSync(full);
    if (stats.size <= 0) return false;
    const key = fileContentKey(full);
    if (!key) return false;
    return true;
  }).map((safeName) => {
    const importName = `sound_${soundImports.length}`;
    soundImports.push(`import ${importName} from ${JSON.stringify(`./__generated_sounds/${outputName}/${safeName}?url`)};`);
    return assetRef(importName);
  });
}

function manifestLiteral(value, indent = 0) {
  if (value && typeof value === "object" && "__assetRef" in value) {
    return value.__assetRef;
  }
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    const pad = " ".repeat(indent);
    const childPad = " ".repeat(indent + 2);
    return `[\n${childPad}${value.map((item) => manifestLiteral(item, indent + 2)).join(`,\n${childPad}`)}\n${pad}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) return "{}";
    const pad = " ".repeat(indent);
    const childPad = " ".repeat(indent + 2);
    return `{\n${entries
      .map(([key, item]) => `${childPad}${JSON.stringify(key)}: ${manifestLiteral(item, indent + 2)}`)
      .join(",\n")}\n${pad}}`;
  }
  return JSON.stringify(value);
}

const manifest = {
  avatars: generatedPublicFiles(["Avatars"], [".png", ".jpg", ".jpeg", ".webp"]),
  potatoFiles: generatedPublicFiles(["Generic Potatoes Transparent"], [".png", ".jpg", ".jpeg", ".webp"]),
  adFiles: generatedPublicMediaFiles(["Game_Ads"], [".mp4", ".webm", ".mov", ".m4v"]),
  sounds: {
    hotStreak: generatedSoundFiles(["Sounds", "Hot Streak"], "hot-streak"),
    potatoExplode: generatedSoundFiles(["Sounds", "Potato Explode"], "potato-explode"),
    babyVoice: generatedSoundFiles(["Sounds", "Baby Hands", "Voice"], "baby-voice"),
    babyCry: generatedSoundFiles(["Sounds", "Baby Hands", "Cry"], "baby-cry"),
    scary: generatedSoundFiles(["Sounds", "Scary"], "scary"),
    aLotOfSpud: generatedSoundFiles(["Sounds"], "root")
  }
};

writeFileSync(
  outFile,
  `// Generated by scripts/generate-assets.mjs. Run npm.cmd run assets after adding media.\n${soundImports.join("\n")}\n\nconst manifest = ${manifestLiteral(manifest)};\n\nexport default manifest;\n`,
  "utf8"
);

console.log(`Wrote ${relative(appRoot, outFile)}`);

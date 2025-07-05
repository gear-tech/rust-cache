import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as buildjetCache from "@actions/buildjet-cache";
import * as warpbuildCache from "@actions/warpbuild-cache";
import * as s3Cache from "@itchyny/s3-cache-action";
import * as ghCache from "@actions/cache";
import fs from "fs";
import { newS3Client } from "@itchyny/s3-cache-action/lib/utils";
import {DownloadOptions} from "@actions/cache/lib/options";

const s3CacheFixed = {
  ...s3Cache,
  isFeatureAvailable(): boolean {
    if (process.env.SWATINEM_RUST_CACHE_S3_BUCKET == undefined) {
      core.warning("`SWATINEM_RUST_CACHE_S3_BUCKET` environment variable is not set");
      return false;
    }
    return true;
  },
  restoreCache: async (paths: string[], primaryKey: string, restoreKeys?: string[], _options?: DownloadOptions, _enableCrossOsArchive?: boolean): Promise<string | undefined> => {
    let bucketName = process.env.SWATINEM_RUST_CACHE_S3_BUCKET || process.exit("`SWATINEM_RUST_CACHE_S3_BUCKET` is not set");
    if (restoreKeys != undefined) {
      await s3Cache.restoreCache(paths, primaryKey, restoreKeys, bucketName, newS3Client());
      return `${bucketName}-${primaryKey}`;
    } else {
      return undefined;
    }
  },
  saveCache: async (paths: string[], key: string): Promise<string | number> => {
    let bucketName = process.env.SWATINEM_RUST_CACHE_S3_BUCKET || process.exit("`SWATINEM_RUST_CACHE_S3_BUCKET` is not set");
    await s3Cache.saveCache(paths, key, bucketName, newS3Client());
    return `${bucketName}-${key}`;
  }
}

export function reportError(e: any) {
  const { commandFailed } = e;
  if (commandFailed) {
    core.error(`Command failed: ${commandFailed.command}`);
    core.error(commandFailed.stderr);
  } else {
    core.error(`${e.stack}`);
  }
}

export async function getCmdOutput(
  cmd: string,
  args: Array<string> = [],
  options: exec.ExecOptions = {},
): Promise<string> {
  let stdout = "";
  let stderr = "";
  try {
    await exec.exec(cmd, args, {
      silent: true,
      listeners: {
        stdout(data) {
          stdout += data.toString();
        },
        stderr(data) {
          stderr += data.toString();
        },
      },
      ...options,
    });
  } catch (e) {
    (e as any).commandFailed = {
      command: `${cmd} ${args.join(" ")}`,
      stderr,
    };
    throw e;
  }
  return stdout;
}

export interface GhCache {
  isFeatureAvailable: typeof ghCache.isFeatureAvailable;
  restoreCache: typeof ghCache.restoreCache;
  saveCache: (paths: string[], key: string) => Promise<string | number>;
}

export interface CacheProvider {
  name: string;
  cache: GhCache;
}

export function getCacheProvider(): CacheProvider {
  const cacheProvider = core.getInput("cache-provider");
  let cache: GhCache;
  switch (cacheProvider) {
    case "github":
      cache = ghCache;
      break;
    case "buildjet":
      cache = buildjetCache;
      break;
    case "warpbuild":
      cache = warpbuildCache;
      break;
    case "s3":
      cache = s3CacheFixed;
      break;
    default:
      throw new Error(`The \`cache-provider\` \`${cacheProvider}\` is not valid.`);
  }

  return {
    name: cacheProvider,
    cache: cache,
  };
}

export async function exists(path: string) {
  try {
    await fs.promises.access(path);
    return true;
  } catch {
    return false;
  }
}

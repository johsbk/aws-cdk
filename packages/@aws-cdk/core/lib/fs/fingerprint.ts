import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { IgnoreStrategy } from './ignore';
import { FingerprintOptions, IgnoreMode, SymlinkFollowMode } from './options';
import { shouldFollow } from './utils';

const BUFFER_SIZE = 8 * 1024;
const CTRL_SOH = '\x01';
const CTRL_SOT = '\x02';
const CTRL_ETX = '\x03';
const CR = '\r';
const LF = '\n';
const CRLF = `${CR}${LF}`;

/**
 * Produces fingerprint based on the contents of a single file or an entire directory tree.
 *
 * Line endings are converted from CRLF to LF.
 *
 * The fingerprint will also include:
 * 1. An extra string if defined in `options.extra`.
 * 2. The symlink follow mode value.
 *
 * @param fileOrDirectory The directory or file to fingerprint
 * @param options Fingerprinting options
 */
export function fingerprint(fileOrDirectory: string, options: FingerprintOptions = { }) {
  const hash = crypto.createHash('sha256');
  _hashField(hash, 'options.extra', options.extraHash || '');
  const follow = options.follow || SymlinkFollowMode.EXTERNAL;
  _hashField(hash, 'options.follow', follow);

  const rootDirectory = fs.statSync(fileOrDirectory).isDirectory()
    ? fileOrDirectory
    : path.dirname(fileOrDirectory);

  const ignoreMode = options.ignoreMode || IgnoreMode.GLOB;
  if (ignoreMode != IgnoreMode.GLOB) {
    _hashField(hash, 'options.ignoreMode', ignoreMode);
  }

  const ignoreStrategy = IgnoreStrategy.fromCopyOptions(options, fileOrDirectory);
  const isDir = fs.statSync(fileOrDirectory).isDirectory();
  _processFileOrDirectory(fileOrDirectory, isDir);

  return hash.digest('hex');

  function _processFileOrDirectory(symbolicPath: string, isRootDir: boolean = false, realPath = symbolicPath) {
    const relativePath = path.relative(fileOrDirectory, symbolicPath);

    if (!isRootDir && ignoreStrategy.ignores(symbolicPath)) {
      return;
    }

    const stat = fs.lstatSync(realPath);

    if (stat.isSymbolicLink()) {
      const linkTarget = fs.readlinkSync(realPath);
      const resolvedLinkTarget = path.resolve(path.dirname(realPath), linkTarget);
      if (shouldFollow(follow, rootDirectory, resolvedLinkTarget)) {
        _processFileOrDirectory(symbolicPath, false, resolvedLinkTarget);
      } else {
        _hashField(hash, `link:${relativePath}`, linkTarget);
      }
    } else if (stat.isFile()) {
      _hashField(hash, `file:${relativePath}`, contentFingerprint(realPath));
    } else if (stat.isDirectory()) {
      for (const item of fs.readdirSync(realPath).sort()) {
        _processFileOrDirectory(path.join(symbolicPath, item), false, path.join(realPath, item));
      }
    } else {
      throw new Error(`Unable to hash ${symbolicPath}: it is neither a file nor a directory`);
    }
  }
}

export function contentFingerprint(file: string): string {
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.alloc(BUFFER_SIZE);
  // eslint-disable-next-line no-bitwise
  const fd = fs.openSync(file, fs.constants.O_DSYNC | fs.constants.O_RDONLY | fs.constants.O_SYNC);
  let size = 0;
  let isBinary = false;
  let lastStr = '';
  let read = 0;
  try {
    while ((read = fs.readSync(fd, buffer, 0, BUFFER_SIZE, null)) !== 0) {
      const slicedBuffer = buffer.slice(0, read);

      // Detect if file is binary by checking the first 8k bytes for the
      // null character (git like implementation)
      if (size === 0) {
        isBinary = slicedBuffer.indexOf(0) !== -1;
      }

      let dataBuffer = slicedBuffer;
      if (!isBinary) { // Line endings normalization (CRLF -> LF)
        const str = buffer.slice(0, read).toString();

        // We are going to normalize line endings to LF. So if the current
        // buffer ends with CR, it could be that the next one starts with
        // LF so we need to save it for later use.
        if (new RegExp(`${CR}$`).test(str)) {
          lastStr += str;
          continue;
        }

        const data = lastStr + str;
        const normalizedData = data.replace(new RegExp(CRLF, 'g'), LF);
        dataBuffer = Buffer.from(normalizedData);
        lastStr = '';
      }

      size += dataBuffer.length;
      hash.update(dataBuffer);
    }

    if (lastStr) {
      hash.update(Buffer.from(lastStr));
    }
  } finally {
    fs.closeSync(fd);
  }
  return `${size}:${hash.digest('hex')}`;
}

function _hashField(hash: crypto.Hash, header: string, value: string | Buffer | DataView) {
  hash.update(CTRL_SOH).update(header).update(CTRL_SOT).update(value).update(CTRL_ETX);
}

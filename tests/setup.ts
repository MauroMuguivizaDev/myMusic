import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { vi } from "vitest";

Object.defineProperty(globalThis, "crypto", {
  value: webcrypto,
  configurable: true,
});
Object.defineProperty(globalThis, "File", {
  value: NodeFile,
  configurable: true,
});
Object.defineProperty(globalThis, "Blob", {
  value: NodeBlob,
  configurable: true,
});
Object.defineProperty(URL, "createObjectURL", {
  value: vi.fn(() => "blob:test"),
  configurable: true,
});
Object.defineProperty(URL, "revokeObjectURL", {
  value: vi.fn(),
  configurable: true,
});
HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
HTMLMediaElement.prototype.pause = vi.fn();
HTMLMediaElement.prototype.load = vi.fn();

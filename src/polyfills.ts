import { Buffer } from "buffer";

type GlobalWithBuffer = typeof globalThis & { Buffer?: typeof Buffer };

if (!(globalThis as GlobalWithBuffer).Buffer) {
  (globalThis as GlobalWithBuffer).Buffer = Buffer;
}

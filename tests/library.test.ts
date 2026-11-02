import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MusicDatabase,
  getAudio,
  importAudio,
  removeTrack,
} from "../src/services/library";
import { MAX_FILE_BYTES, validateAudio } from "../src/domain/music";

let database: MusicDatabase;
beforeEach(() => {
  database = new MusicDatabase(`test-${crypto.randomUUID()}`);
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await database.delete();
});

describe("biblioteca offline", () => {
  it("rejeita a importação sem Web Crypto e conserva os dados existentes", async () => {
    await importAudio(new File(["existing"], "existing.mp3"), database);
    vi.stubGlobal("crypto", { subtle: undefined });
    await expect(importAudio(new File(["new"], "new.mp3"), database)).rejects.toThrow("HTTPS");
    expect(await database.tracks.count()).toBe(1);
    expect(await database.files.count()).toBe(1);
  });
  it("guarda o áudio original e reabre a coleção após fechar a ligação", async () => {
    const file = new File(["audio-content"], "A minha música.mp3", {
      type: "audio/mpeg",
    });
    expect(await importAudio(file, database)).toBe("added");
    const track = (await database.tracks.toArray())[0];
    expect(track.title).toBe("A minha música");
    expect((await getAudio(track.id, database)).size).toBe(file.size);
    database.close();
    await database.open();
    expect(await database.tracks.count()).toBe(1);
    expect(await database.files.count()).toBe(1);
  });
  it("evita duplicados pelo conteúdo, mesmo com nomes diferentes", async () => {
    await importAudio(new File(["same"], "first.mp3"), database);
    expect(await importAudio(new File(["same"], "second.wav"), database)).toBe(
      "duplicate",
    );
    expect(await database.tracks.count()).toBe(1);
  });
  it("remove áudio e metadados em conjunto", async () => {
    await importAudio(new File(["audio"], "test.mp3"), database);
    const track = (await database.tracks.toArray())[0];
    await removeTrack(track.id, database);
    expect(await database.tracks.count()).toBe(0);
    expect(await database.files.count()).toBe(0);
    await expect(getAudio(track.id, database)).rejects.toThrow(
      "não está disponível",
    );
  });
  it("reverte a gravação do áudio quando falha a gravação dos metadados", async () => {
    vi.spyOn(database.tracks, "add").mockRejectedValue(
      new DOMException("Full", "QuotaExceededError"),
    );
    await expect(
      importAudio(new File(["audio"], "test.mp3"), database),
    ).rejects.toThrow("Full");
    expect(await database.files.count()).toBe(0);
    expect(await database.tracks.count()).toBe(0);
  });
  it("rejeita ficheiros vazios, formatos inválidos e ficheiros grandes", async () => {
    expect(() => validateAudio(new File([], "empty.mp3"))).toThrow("vazio");
    await expect(
      importAudio(new File(["text"], "notes.txt"), database),
    ).rejects.toThrow("Formato");
    const large = new File(["x"], "large.mp3");
    Object.defineProperty(large, "size", { value: MAX_FILE_BYTES + 1 });
    expect(() => validateAudio(large)).toThrow("200 MB");
    expect(await database.tracks.count()).toBe(0);
  });
});

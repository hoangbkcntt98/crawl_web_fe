import { mkdir, rm } from "fs/promises";
import { dirname, resolve, sep } from "path";

export const imageStorageRoot = resolve(
  process.env.MANGA_IMAGE_STORAGE || "/home/opc/manga-storage"
);

function isInsideStorage(path: string) {
  return path.startsWith(`${imageStorageRoot}${sep}`);
}

export async function removeStoredChapterImages(paths: string[]) {
  const chapterDirectories = new Set(
    paths
      .map((path) => dirname(resolve(path)))
      .filter((path) => isInsideStorage(path))
  );
  await Promise.all(
    Array.from(chapterDirectories, (path) =>
      rm(path, { force: true, recursive: true })
    )
  );
}

export async function clearStoredChapterImages() {
  const chaptersPath = resolve(imageStorageRoot, "chapters");
  await rm(chaptersPath, { force: true, recursive: true });
  await mkdir(chaptersPath, { recursive: true });
}

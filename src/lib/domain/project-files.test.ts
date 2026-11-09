import { describe, expect, it } from "vitest";
import { fileModuleAccess, fileStoragePath, parseTags, photoRejection, safeFileName } from "./project-files";

const base = { businessOn: true, projectOn: true, canView: true, canContribute: true, canManage: false };

describe("fileModuleAccess", () => {
  it("contributors upload when the module is on for business and project", () => {
    expect(fileModuleAccess(base)).toEqual({ visible: true, canUpload: true, historicOnly: false });
  });
  it("viewers see but cannot upload", () => {
    expect(fileModuleAccess({ ...base, canContribute: false }).canUpload).toBe(false);
  });
  it("switched off for the project hides it from members", () => {
    expect(fileModuleAccess({ ...base, projectOn: false }).visible).toBe(false);
  });
  it("switched off for the business leaves project admins read-only access", () => {
    expect(fileModuleAccess({ ...base, businessOn: false, canManage: true })).toEqual({ visible: true, canUpload: false, historicOnly: true });
  });
  it("no project access means nothing", () => {
    expect(fileModuleAccess({ ...base, canView: false, canManage: true }).visible).toBe(false);
  });
});

describe("paths and names", () => {
  it("builds the five-part storage path the database checks", () => {
    expect(fileStoragePath({ tenantId: "t", projectId: "p", module: "photos", fileId: "f", uploadId: "u", fileName: "Site photo 1.JPG" }))
      .toBe("t/p/photos/f/u-Site_photo_1.JPG");
  });
  it("strips slashes so a name cannot add path parts", () => {
    expect(safeFileName("../a/b.pdf")).not.toContain("/");
  });
  it("keeps the extension when shortening", () => {
    const n = safeFileName("x".repeat(200) + ".pdf");
    expect(n.length).toBe(120);
    expect(n.endsWith(".pdf")).toBe(true);
  });
});

describe("tags and validation", () => {
  it("parses tags uniquely in lower case", () => {
    expect(parseTags(" Roof, roof ,Level 2,, ")).toEqual(["roof", "level 2"]);
  });
  it("rejects non-images for photos and files over 50 MB", () => {
    expect(photoRejection({ type: "application/pdf", size: 10 }, "photos")).toBe("Not an image");
    expect(photoRejection({ type: "application/pdf", size: 10 }, "documents")).toBeNull();
    expect(photoRejection({ type: "image/jpeg", size: 51 * 1024 * 1024 }, "photos")).toBe("Larger than 50 MB");
  });
});

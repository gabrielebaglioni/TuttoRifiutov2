import assert from "node:assert/strict";
import test from "node:test";
import { AdminDrafts, AuthEpoch, BusyResources, DirtyResources, buildCollectionReorderRequest, buildContentRequest, buildMediaMetadataRequest, buildMediaOrderRequest, collectionSlugControl, mediaPreviewKind, mergeMediaSlots, runBusyResource, setAtPath, updateDraft } from "../src/scripts/admin-model.js";

test("content saves use the handler's value envelope", () => {
  assert.deepEqual(buildContentRequest("home.hero.title", "Nuovo"), {
    path: "/api/admin/content/home.hero.title", method: "PUT", body: { value: "Nuovo" },
  });
});

test("nested draft updates preserve sibling object and tuple values", () => {
  const source = { seo: { title: "A", description: "B" }, rows: [["uno", "due"]] };
  const changed = setAtPath(source, ["rows", 0, 1], "tre");
  assert.deepEqual(changed, { seo: { title: "A", description: "B" }, rows: [["uno", "tre"]] });
  assert.deepEqual(source, { seo: { title: "A", description: "B" }, rows: [["uno", "due"]] });
});

test("dirty resources clear only the saved resource", () => {
  const dirty = new DirtyResources();
  dirty.mark("content:a"); dirty.mark("content:b"); dirty.clear("content:a");
  assert.equal(dirty.count, 1); assert.equal(dirty.has("content:b"), true);
});

test("reorder and typed media metadata each use one protected request payload", () => {
  assert.deepEqual(buildCollectionReorderRequest("archive", [{ slug: "a", position: 1 }, { slug: "b", position: 0 }]), {
    path: "/api/admin/archive/_order", method: "PUT", body: { items: [{ slug: "a", position: 1 }, { slug: "b", position: 0 }] },
  });
  assert.deepEqual(buildMediaMetadataRequest("events", 4, { role: "detail", alt: "Testo", position: 2 }), {
    path: "/api/admin/media/events/4", method: "PUT", body: { role: "detail", alt: "Testo", position: 2 },
  });
  assert.deepEqual(buildMediaOrderRequest("events", "fixture", [{ id: 4, position: 1 }, { id: 2, position: 0 }]), {
    path: "/api/admin/media/_order", method: "PUT", body: {
      ownerType: "events", ownerSlug: "fixture", items: [{ id: 4, position: 1 }, { id: 2, position: 0 }],
    },
  });
});

test("central drafts retain sibling edits across tab renders without replacing the input model", () => {
  const drafts = new AdminDrafts();
  drafts.begin("content:home", { hero: { title: "A", subtitle: "B" } });
  drafts.set("content:home", ["hero", "title"], "Alfa");
  drafts.set("content:home", ["hero", "subtitle"], "Beta");
  assert.deepEqual(drafts.get("content:home"), { hero: { title: "Alfa", subtitle: "Beta" } });
  assert.equal(drafts.get("content:home"), drafts.get("content:home"));
});

test("busy resources prevent duplicate operations until released", () => {
  const busy = new BusyResources();
  const first = busy.acquire("upload:1");
  assert.equal(typeof first, "number"); assert.equal(busy.acquire("upload:1"), null);
  assert.equal(busy.release("upload:1", first), true);
  assert.equal(typeof busy.acquire("upload:1"), "number");
});

test("central drafts retain collection, unsaved, and media changes without replacing an input or sibling model", () => {
  const drafts = new AdminDrafts();
  const dirty = new DirtyResources();
  const resource = "collection:events:new:client-1";
  const control = { value: "Titolo aggiornato" };
  const sibling = { value: "Resta qui" };
  drafts.begin(resource, { slug: "nuovo-evento", title: "Nuovo", media: [{ alt: "Prima" }] });

  const returned = updateDraft(drafts, dirty, resource, ["title"], control);
  updateDraft(drafts, dirty, resource, ["media", 0, "alt"], "Descrizione aggiornata");

  assert.equal(returned, control);
  assert.equal(sibling.value, "Resta qui");
  assert.deepEqual(drafts.get(resource), { slug: "nuovo-evento", title: "Titolo aggiornato", media: [{ alt: "Descrizione aggiornata" }] });
  assert.equal(dirty.has(resource), true);
  assert.equal(drafts.begin(resource, { title: "Da non sovrascrivere" }).title, "Titolo aggiornato");
});

test("slot-aware media merge retains virtual fallbacks until an active stored slot replaces them", () => {
  const item = {
    cardMedia: { type: "image", src: "/fallback-cover.webp", alt: "Fallback cover" },
    detailMedia: [
      { type: "video", src: "/fallback-video.mp4", poster: "/fallback-poster.webp", alt: "Fallback video" },
      { type: "image", src: "/fallback-detail.webp", alt: "Fallback detail" },
    ],
    media: [{ id: 17, role: "detail", position: 1, src: "/media/stored.webp", alt: "Stored detail" }],
  };

  const merged = mergeMediaSlots(item);
  assert.deepEqual(merged.map(({ id, role, position, src, virtual }) => ({ id, role, position, src, virtual })), [
    { id: undefined, role: "cover", position: 0, src: "/fallback-cover.webp", virtual: true },
    { id: undefined, role: "detail", position: 0, src: "/fallback-video.mp4", virtual: true },
    { id: 17, role: "detail", position: 1, src: "/media/stored.webp", virtual: undefined },
  ]);
  assert.equal(mediaPreviewKind(merged[1]), "video");
  assert.equal(mediaPreviewKind({ src: "/media/animated.mp4?version=1" }), "video");
  assert.equal(mediaPreviewKind(merged[0]), "image");

  const revealed = mergeMediaSlots({ ...item, media: [] });
  assert.equal(revealed[2].src, "/fallback-detail.webp");
  assert.equal(revealed[2].virtual, true);
});

test("auth epochs prevent stale successful work from reviving a reset editor", async () => {
  const epoch = new AuthEpoch();
  const requestEpoch = epoch.capture();
  epoch.invalidate();
  assert.equal(epoch.isCurrent(requestEpoch), false);
  assert.equal(epoch.isCurrent(epoch.capture()), true);
});

test("busy runner deduplicates concurrent work and always releases its resource", async () => {
  const busy = new BusyResources();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const first = runBusyResource(busy, "content:home", async () => { await gate; return "saved"; });
  const duplicate = await runBusyResource(busy, "content:home", async () => "duplicate");
  assert.deepEqual(duplicate, { started: false });
  release();
  assert.deepEqual(await first, { started: true, value: "saved" });
  assert.equal(busy.has("content:home"), false);
});

test("existing collection slugs are explicit read-only controls while new slugs remain editable", () => {
  assert.deepEqual(collectionSlugControl({ slug: "esistente", isNew: false }), { value: "esistente", readOnly: true });
  assert.deepEqual(collectionSlugControl({ slug: "nuovo", isNew: true }), { value: "nuovo", readOnly: false });
});

test("draft rebase preserves unsaved editorial paths while refreshing named server-owned paths", () => {
  const drafts = new AdminDrafts();
  const resource = "collection:events:fixture";
  drafts.begin(resource, {
    slug: "fixture",
    title: "Titolo iniziale",
    position: 9,
    cardMedia: { src: "/fallback/old-card.webp" },
    heroMedia: { src: "/fallback/old-hero.webp" },
    detailMedia: [{ src: "/fallback/old-detail.webp" }],
    media: [{ id: 1, role: "cover", position: 0, src: "/media/old.webp" }],
  });
  drafts.set(resource, ["title"], "Titolo non salvato");
  const request = drafts.snapshot(resource);

  const result = drafts.rebase(resource, {
    slug: "fixture",
    title: "Titolo server",
    position: 2,
    cardMedia: { src: "/fallback/new-card.webp" },
    heroMedia: { src: "/fallback/new-hero.webp" },
    detailMedia: [{ src: "/fallback/new-detail.webp" }],
    media: [{ id: 2, role: "cover", position: 0, src: "/media/new.webp" }],
  }, {
    expectedRevision: request.revision,
    paths: [["position"], ["cardMedia"], ["heroMedia"], ["detailMedia"], ["media"]],
  });

  assert.equal(result.applied, true);
  assert.equal(drafts.get(resource).title, "Titolo non salvato");
  assert.deepEqual(drafts.get(resource).media, [{ id: 2, role: "cover", position: 0, src: "/media/new.webp" }]);
  assert.deepEqual(drafts.get(resource).detailMedia, [{ src: "/fallback/new-detail.webp" }]);
  assert.equal(drafts.get(resource).position, 2);
});

test("draft revisions and resource prefixes prevent stale cleanup and preserve child identity transitions", () => {
  const drafts = new AdminDrafts();
  const dirty = new DirtyResources();
  const busy = new BusyResources();
  const newParent = "collection:events:new-1";
  const newMedia = "media:events:new-1:fallback:cover:0";
  drafts.begin(newParent, { title: "Nuovo" });
  drafts.begin(newMedia, { alt: "Fallback" });
  dirty.mark(newParent); dirty.mark(newMedia);
  busy.acquire(newMedia);

  const beforeEdit = drafts.snapshot(newParent);
  drafts.set(newParent, ["title"], "Edit successivo");
  assert.equal(drafts.clear(newParent, { expectedRevision: beforeEdit.revision }), false);
  assert.equal(drafts.get(newParent).title, "Edit successivo");

  assert.equal(drafts.remapPrefix("collection:events:new-1", "collection:events:41"), 1);
  assert.equal(drafts.remapPrefix("media:events:new-1", "media:events:fixture"), 1);
  assert.equal(dirty.remapPrefix("collection:events:new-1", "collection:events:41"), 1);
  assert.equal(dirty.remapPrefix("media:events:new-1", "media:events:fixture"), 1);
  assert.equal(busy.remapPrefix("media:events:new-1", "media:events:fixture"), 1);
  assert.equal(drafts.get("collection:events:41").title, "Edit successivo");
  assert.equal(dirty.has("media:events:fixture:fallback:cover:0"), true);
  assert.equal(busy.has("media:events:fixture:fallback:cover:0"), true);

  assert.equal(drafts.clearPrefix("media:events:fixture"), 1);
  assert.equal(dirty.clearPrefix("media:events:fixture"), 1);
  assert.equal(busy.clearPrefix("media:events:fixture"), 1);
  assert.equal(drafts.get("media:events:fixture:fallback:cover:0"), undefined);
  assert.equal(dirty.has("media:events:fixture:fallback:cover:0"), false);
  assert.equal(busy.has("media:events:fixture:fallback:cover:0"), false);
});

test("draft rebase starts from fresh server data and overlays only explicitly dirty paths", () => {
  const drafts = new AdminDrafts();
  const resource = "collection:events:fixture";
  drafts.begin(resource, {
    title: "Titolo iniziale",
    summary: "Sommario iniziale",
    position: 0,
    meta: ["Vecchia voce"],
    seo: { title: "SEO iniziale", description: "" },
  });

  drafts.rebase(resource, {
    title: "Titolo server uno",
    summary: "Sommario server uno",
    position: 1,
    meta: ["Server uno"],
    seo: { title: "SEO server uno", description: "Descrizione uno" },
  });
  assert.deepEqual(drafts.get(resource), {
    title: "Titolo server uno",
    summary: "Sommario server uno",
    position: 1,
    meta: ["Server uno"],
    seo: { title: "SEO server uno", description: "Descrizione uno" },
  });

  drafts.set(resource, ["title"], "Titolo locale");
  drafts.set(resource, ["meta"], ["Voce locale"]);
  drafts.rebase(resource, {
    title: "Titolo server due",
    summary: "Sommario server due",
    position: 2,
    meta: ["Server due"],
    seo: { title: "SEO server due", description: "Descrizione due" },
  });

  assert.deepEqual(drafts.get(resource), {
    title: "Titolo locale",
    summary: "Sommario server due",
    position: 2,
    meta: ["Voce locale"],
    seo: { title: "SEO server due", description: "Descrizione due" },
  });
  assert.deepEqual(drafts.dirtyPaths(resource), [["title"], ["meta"]]);
});

test("busy generations reject stale releases after a reset, reacquire, or prefix remap", () => {
  const busy = new BusyResources();
  const temporary = "media:events:new-1:stored:7";
  const canonical = "media:events:fixture:stored:7";
  const first = busy.acquire(temporary);
  assert.equal(typeof first, "number");
  assert.equal(busy.release(temporary, first), true);

  const second = busy.acquire(temporary);
  assert.notEqual(second, first);
  assert.equal(busy.release(temporary, first), false);
  assert.equal(busy.has(temporary), true);
  assert.equal(busy.remapPrefix("media:events:new-1", "media:events:fixture"), 1);
  assert.equal(busy.has(canonical), true);
  assert.equal(busy.release(temporary, second), true);
  assert.equal(busy.has(canonical), false);

  const remapped = busy.acquire(temporary);
  const canonicalOperation = busy.acquire(canonical);
  assert.equal(busy.remapPrefix("media:events:new-1", "media:events:fixture"), 1);
  assert.equal(busy.release(temporary, remapped), false);
  assert.equal(busy.has(canonical), true);
  assert.equal(busy.release(canonical, canonicalOperation), true);

  const beforeReset = busy.acquire(canonical);
  busy.reset();
  const afterReset = busy.acquire(canonical);
  assert.notEqual(afterReset, beforeReset);
  assert.equal(busy.release(canonical, beforeReset), false);
  assert.equal(busy.has(canonical), true);
});

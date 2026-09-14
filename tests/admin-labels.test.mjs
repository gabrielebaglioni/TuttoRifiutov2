import test from "node:test";
import assert from "node:assert/strict";
import { contentLabel, fieldLabel } from "../src/scripts/admin-labels.js";

test("editor headings describe the home story and animation instead of only code keys", () => {
  assert.match(contentLabel("home.about.paragraphs"), /Racconto della storia/);
  assert.match(contentLabel("home.transition.title"), /animazione del pacchetto/);
  assert.equal(fieldLabel("description"), "Descrizione principale");
});

test("structured copy keeps understandable labels for steps and sightings", () => {
  assert.equal(fieldLabel("home.how_it_works.items.2.2"), "Descrizione del passaggio");
  assert.equal(fieldLabel("home.clients.rows.1.2"), "Quartiere");
  assert.match(fieldLabel("status"), /in agenda.*del passato/);
});

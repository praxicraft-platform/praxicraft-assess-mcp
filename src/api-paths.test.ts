import assert from "node:assert/strict";
import test from "node:test";
import {
  appendQuery,
  extractCursorFromUrl,
  listPath,
  publicPath,
  queryParams,
  withPaginationCursors,
  PUBLIC_PREFIX,
} from "./api-paths.js";

test("listPath builds correct assessment list URLs", () => {
  assert.equal(listPath("assessments"), `${PUBLIC_PREFIX}/assessments/`);
  assert.equal(
    listPath("assessments", { search: "backend", status: "active" }),
    `${PUBLIC_PREFIX}/assessments/?search=backend&status=active`,
  );
});

test("listPath builds correct interview list URLs", () => {
  assert.equal(listPath("interviews"), `${PUBLIC_PREFIX}/interviews/`);
  assert.equal(
    listPath("interviews", { status: "scheduled", q: "jane" }),
    `${PUBLIC_PREFIX}/interviews/?status=scheduled&q=jane`,
  );
});

test("publicPath builds nested resource URLs", () => {
  assert.equal(publicPath("assessments", "my-slug"), `${PUBLIC_PREFIX}/assessments/my-slug/`);
  assert.equal(
    publicPath("interviews", "room-uuid", "analysis"),
    `${PUBLIC_PREFIX}/interviews/room-uuid/analysis/`,
  );
  assert.equal(
    publicPath("webhooks", "create"),
    `${PUBLIC_PREFIX}/webhooks/create/`,
  );
});

test("appendQuery adds cursor pagination to nested paths", () => {
  const base = publicPath("assessments", "my-slug", "results");
  assert.equal(
    appendQuery(base, queryParams({ cursor: "abc123", page_size: 50 })),
    `${PUBLIC_PREFIX}/assessments/my-slug/results/?cursor=abc123&page_size=50`,
  );
  assert.equal(appendQuery(base, queryParams({})), base);
});

test("queryParams drops empty values and stringifies numbers", () => {
  assert.deepEqual(queryParams({ cursor: "x", page_size: 100, search: "" }), {
    cursor: "x",
    page_size: "100",
  });
});

test("extractCursorFromUrl reads cursor from absolute next links", () => {
  assert.equal(
    extractCursorFromUrl(
      "http://bureau-backend/api/v1/public/assessments/x/results/?cursor=cD0yMDI2",
    ),
    "cD0yMDI2",
  );
  assert.equal(extractCursorFromUrl(null), null);
});

test("withPaginationCursors adds next_cursor and previous_cursor", () => {
  const enriched = withPaginationCursors({
    next: "https://assess.praxicraft.com/api/v1/public/assessments/?cursor=nextTok",
    previous: null,
    results: [{ id: 1 }],
  });
  assert.deepEqual(enriched, {
    next: "https://assess.praxicraft.com/api/v1/public/assessments/?cursor=nextTok",
    previous: null,
    results: [{ id: 1 }],
    next_cursor: "nextTok",
    previous_cursor: null,
  });
});

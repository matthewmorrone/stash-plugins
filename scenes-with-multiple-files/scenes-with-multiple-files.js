(() => {
  "use strict";

  const LOG_PREFIX = "[ScenesWithMultipleFiles]";
  const REQUIRE_DELETE_CONFIRM = false;

  let swmfSceneFilesBySceneId = new Map();

  const INSTALL_FLAG = "__scenes_with_multiple_files_installed__";
  if (window[INSTALL_FLAG]) return;
  window[INSTALL_FLAG] = true;

  // Exact query (no guessing) as provided.
  const QUERY_SCENES_WITH_MULTIPLE_FILES = `
query ScenesWithMultipleFiles {
  findScenes(
    filter: { per_page: 50, page: 1 }
    scene_filter: {
      file_count: { value: 1, modifier: GREATER_THAN }
    }
  ) {
    count
    scenes {
      id
      title
      files {
        id
        path
        basename
        size
        format
        width
        height
        duration
        video_codec
        audio_codec
        frame_rate
        bit_rate
        created_at
        updated_at
      }
    }
  }
}
`;

  // console.log(LOG_PREFIX, "Loaded", { href: location.href, path: location.pathname });

  function isOnDuplicateChecker() {
    return /^\/sceneduplicatechecker\/?$/i.test(String(location.pathname || ""));
  }

  async function gql(query, variables, { timeoutMs = 30_000 } = {}) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const response = await fetch("/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(variables ? { query, variables } : { query }),
      signal: controller ? controller.signal : undefined,
    });

    if (timeout) clearTimeout(timeout);

    const json = await response.json();
    if (json?.errors?.length) {
      const msg = json.errors.map((e) => e?.message).filter(Boolean).join("; ");
      throw new Error(msg || "GraphQL error");
    }

    return json?.data;
  }

  function unwrapType(t) {
    let cur = t;
    let nonNull = false;
    let list = false;
    while (cur && cur.kind === "NON_NULL") {
      nonNull = true;
      cur = cur.ofType;
    }
    while (cur && cur.kind === "LIST") {
      list = true;
      cur = cur.ofType;
      while (cur && cur.kind === "NON_NULL") cur = cur.ofType;
    }
    return {
      kind: cur?.kind || null,
      name: cur?.name || null,
      nonNull,
      list,
    };
  }

  const INTROSPECT_MUTATIONS = `
query __SwmfIntrospectMutations {
  __schema {
    mutationType {
      fields {
        name
        args { name type { kind name ofType { kind name ofType { kind name ofType { kind name }}}}}
        type { kind name ofType { kind name ofType { kind name ofType { kind name }}}}
      }
    }
  }
}
`;

  const INTROSPECT_TYPE = `
query __SwmfIntrospectType($name: String!) {
  __type(name: $name) {
    kind
    name
    inputFields { name type { kind name ofType { kind name ofType { kind name ofType { kind name }}}}}
  }
}
`;

  let sceneUpdateInputFieldsPromise = null;
  async function getSceneUpdateInputFieldNames() {
    if (sceneUpdateInputFieldsPromise) return sceneUpdateInputFieldsPromise;
    sceneUpdateInputFieldsPromise = (async () => {
      const typeData = await gql(INTROSPECT_TYPE, { name: "SceneUpdateInput" });
      const inputFields = typeData?.__type?.inputFields;
      const fieldsArr = Array.isArray(inputFields) ? inputFields : [];
      return new Set(fieldsArr.map((f) => f?.name).filter(Boolean));
    })();
    return sceneUpdateInputFieldsPromise;
  }

  async function setScenePrimaryFile(sceneId, primaryFileId, allFileIdsForScene) {
    const fieldNames = await getSceneUpdateInputFieldNames();

    const mutation = `
      mutation SceneUpdate($input: SceneUpdateInput!) {
        sceneUpdate(input: $input) { id }
      }
    `;

    if (fieldNames.has("primary_file_id")) {
      return gql(mutation, { input: { id: String(sceneId), primary_file_id: String(primaryFileId) } });
    }

    if (fieldNames.has("file_ids")) {
      const ids = Array.isArray(allFileIdsForScene) ? allFileIdsForScene.map(String) : [];
      const rest = ids.filter((x) => x !== String(primaryFileId));
      const next = [String(primaryFileId), ...rest];
      return gql(mutation, { input: { id: String(sceneId), file_ids: next } });
    }

    throw new Error("SceneUpdateInput lacks primary_file_id/file_ids; cannot swap primary");
  }

  let deleteSpecPromise = null;
  async function getDeleteFileSpec() {
    if (deleteSpecPromise) return deleteSpecPromise;
    deleteSpecPromise = (async () => {
      const data = await gql(INTROSPECT_MUTATIONS);
      const fields = data?.__schema?.mutationType?.fields;
      const mutations = Array.isArray(fields) ? fields : [];

      const candidates = mutations
        .filter((m) => m && /file/i.test(m.name) && /(delete|destroy|remove)/i.test(m.name))
        .map((m) => {
          const args = Array.isArray(m.args) ? m.args : [];
          const returnType = unwrapType(m.type);
          let score = 0;
          if (/^(delete|destroy|remove)/i.test(m.name)) score += 5;
          if (returnType.kind === "SCALAR" && returnType.name === "Boolean") score += 2;
          if (args.some((a) => a?.name === "id" && unwrapType(a.type).name === "ID")) score += 10;
          if (args.some((a) => a?.name === "input")) score += 6;
          return { m, args, returnType, score };
        })
        .sort((a, b) => b.score - a.score);

      const chosen = candidates[0];
      if (!chosen) return null;

      const idArg = chosen.args.find((a) => a?.name === "id");
      if (idArg) {
        return {
          kind: "id",
          name: chosen.m.name,
          returnType: chosen.returnType,
        };
      }

      const inputArg = chosen.args.find((a) => a?.name === "input");
      if (!inputArg) return null;

      const inputType = unwrapType(inputArg.type);
      if (!inputType?.name) return null;

      const typeData = await gql(INTROSPECT_TYPE, { name: inputType.name });
      const inputFields = typeData?.__type?.inputFields;
      const fieldsArr = Array.isArray(inputFields) ? inputFields : [];
      const fieldNames = new Set(fieldsArr.map((f) => f?.name).filter(Boolean));

      let inputShape = null;
      if (fieldNames.has("id")) inputShape = "id";
      else if (fieldNames.has("file_id")) inputShape = "file_id";
      else if (fieldNames.has("ids")) inputShape = "ids";
      else if (fieldNames.has("file_ids")) inputShape = "file_ids";

      if (!inputShape) return null;
      return {
        kind: "input",
        name: chosen.m.name,
        inputTypeName: inputType.name,
        inputShape,
        returnType: chosen.returnType,
      };
    })();

    return deleteSpecPromise;
  }

  async function deleteFileById(fileId, sceneId) {
    const id = String(fileId);

    console.log(LOG_PREFIX, "deleteFileById start", { fileId: id });

    async function tryCommonMutations() {
      const attempts = [
        // Stash commonly exposes deleteFiles (plural)
        { name: "deleteFiles", q: "mutation($ids: [ID!]!){ deleteFiles(ids:$ids) }", v: { ids: [id] } },
        { name: "deleteFiles", q: "mutation($file_ids: [ID!]!){ deleteFiles(file_ids:$file_ids) }", v: { file_ids: [id] } },
        { name: "deleteFiles", q: "mutation($ids: [ID!]!){ deleteFiles(file_ids:$ids) }", v: { ids: [id] } },
        { name: "deleteFiles", q: "mutation($file_ids: [ID!]!){ deleteFiles(ids:$file_ids) }", v: { file_ids: [id] } },
        { name: "deleteFiles", q: "mutation($input: DeleteFilesInput!){ deleteFiles(input:$input) }", v: { input: { ids: [id] } } },
        { name: "deleteFiles", q: "mutation($input: DeleteFilesInput!){ deleteFiles(input:$input) }", v: { input: { file_ids: [id] } } },

        { name: "fileDestroy", q: "mutation($id: ID!){ fileDestroy(id:$id) }", v: { id } },
        { name: "deleteFile", q: "mutation($id: ID!){ deleteFile(id:$id) }", v: { id } },
        { name: "destroyFile", q: "mutation($id: ID!){ destroyFile(id:$id) }", v: { id } },
        { name: "removeFile", q: "mutation($id: ID!){ removeFile(id:$id) }", v: { id } },
        { name: "fileDestroy", q: "mutation($input: FileDestroyInput!){ fileDestroy(input:$input) }", v: { input: { id } } },
        { name: "destroyFile", q: "mutation($input: DestroyFileInput!){ destroyFile(input:$input) }", v: { input: { id } } },
        { name: "deleteFile", q: "mutation($input: FileDeleteInput!){ deleteFile(input:$input) }", v: { input: { id } } },
        { name: "deleteFile", q: "mutation($input: DeleteFileInput!){ deleteFile(input:$input) }", v: { input: { id } } },
        { name: "removeFile", q: "mutation($input: FileRemoveInput!){ removeFile(input:$input) }", v: { input: { id } } },
      ];

      let lastErr = null;
      for (const a of attempts) {
        try {
          const res = await gql(a.q, a.v);
          const val = res ? res[a.name] : undefined;
          console.log(LOG_PREFIX, "Delete attempt result", a.name, val);
          if (typeof val === "boolean") {
            if (!val) throw new Error(`${a.name} returned false`);
          } else if (val == null) {
            // Some mutations return non-boolean; null/undefined means failure.
            throw new Error(`${a.name} returned null`);
          }
          return res;
        } catch (e) {
          lastErr = e;
          console.warn(LOG_PREFIX, "Delete attempt failed", a.q, e?.message || e);
        }
      }
      throw lastErr || new Error("Delete failed");
    }

    let spec = null;
    try {
      spec = await getDeleteFileSpec();
    } catch (e) {
      console.warn(LOG_PREFIX, "Introspection for delete mutation failed; falling back", e?.message || e);
      return tryCommonMutations();
    }

    if (!spec) {
      console.warn(LOG_PREFIX, "No delete mutation found by introspection; falling back");
      try {
        return await tryCommonMutations();
      } catch (e) {
        // If the file is primary, Stash can refuse deletion; try swapping primary then retry.
        const sid = sceneId ? String(sceneId) : "";
        const filesForScene = sid ? swmfSceneFilesBySceneId.get(sid) : null;
        if (sid && Array.isArray(filesForScene) && filesForScene.length > 1) {
          const alt = filesForScene.find((x) => String(x) !== id);
          if (alt) {
            console.warn(LOG_PREFIX, "Delete failed; trying primary swap then retry", { sceneId: sid, alt });
            await setScenePrimaryFile(sid, alt, filesForScene);
            return tryCommonMutations();
          }
        }
        throw e;
      }
    }

    console.log(LOG_PREFIX, "Using delete mutation", spec);

    if (spec.kind === "id") {
      const mutation = `mutation __SwmfDelete($id: ID!) { ${spec.name}(id: $id) }`;
      return gql(mutation, { id });
    }

    const input =
      spec.inputShape === "ids" || spec.inputShape === "file_ids"
        ? { [spec.inputShape]: [id] }
        : { [spec.inputShape]: id };

    const selection = spec.returnType.kind === "SCALAR" || spec.returnType.kind === "ENUM" ? "" : " { __typename }";
    const mutation = `mutation __SwmfDelete($input: ${spec.inputTypeName}!) { ${spec.name}(input: $input)${selection} }`;
    return gql(mutation, { input });
  }

  function norm(s) {
    return String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function formatDuration(seconds) {
    const n = Number(seconds);
    if (!Number.isFinite(n) || n <= 0) return "";
    const total = Math.round(n);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const mm = String(m).padStart(h ? 2 : 1, "0");
    const ss = String(s).padStart(2, "0");
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  function formatMiB(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return "";
    // Match the UI which typically shows whole MiB.
    return `${Math.round(n / (1024 * 1024))} MiB`;
  }

  function formatMbps(bitRate) {
    const n = Number(bitRate);
    if (!Number.isFinite(n) || n <= 0) return "";
    return `${(n / 1_000_000).toFixed(2)}\u00A0mbps`;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fileRowHtml({ sceneId, sceneTitle, file, isFirstRowForScene }) {
    const cls = isFirstRowForScene ? "duplicate-group scp-card" : "scp-card";

    const path = file?.path || file?.basename || "";
    const title = (sceneTitle && String(sceneTitle).trim()) ? String(sceneTitle).trim() : `Scene ${sceneId}`;
    const duration = formatDuration(file?.duration);
    const size = formatMiB(file?.size);
    const resolution = file?.width && file?.height ? `${file.width}x${file.height}` : "";
    const codec = file?.video_codec || "";

    const mbpsRaw = formatMbps(file?.bit_rate);
    const bitRateHtml = escapeHtml(mbpsRaw).replace(/\u00A0/g, "&nbsp;");

    return `
<tr class="${cls}">
  <td>
    <div class="form-check"><input type="checkbox" class="form-check-input position-static"></div>
  </td>
  <td>
    <div></div>
  </td>
  <td class="text-left">
    <p><a target='_blank' style="font-weight: inherit; text-decoration: inherit;" href="/scenes/${encodeURIComponent(String(sceneId))}"> ${escapeHtml(title)} </a></p>
    <p class="scene-path">${escapeHtml(path)}</p>
  </td>
  <td class="scene-details"></td>
  <td>${escapeHtml(duration)}</td>
  <td>${escapeHtml(size)}</td>
  <td>${escapeHtml(resolution)}</td>
  <td>${bitRateHtml}</td>
  <td>${escapeHtml(codec)}</td>
  <td class="text-right">
    <button type="button" class="btn btn-danger btn-sm swmf-delete" data-swmf-file-id="${escapeHtml(file?.id)}" data-swmf-scene-id="${escapeHtml(sceneId)}">Delete</button>
  </td>
</tr>`.trim();
  }

  function separatorRowHtml() {
    return `<tr class="separator"></tr>`;
  }

  function waitForElement(selector, timeoutMs = 15_000) {
    const existing = document.querySelector(selector);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        obs.disconnect();
        resolve(null);
      }, timeoutMs);

      const obs = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (!el) return;
        clearTimeout(timeout);
        obs.disconnect();
        resolve(el);
      });

      obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
    });
  }


  async function run() {
    // console.log(LOG_PREFIX, "Running GraphQL query: ScenesWithMultipleFiles");
    const data = await gql(QUERY_SCENES_WITH_MULTIPLE_FILES);

    // Proof: raw payload in logs
    // console.log(LOG_PREFIX, "GraphQL data", data);

    const payload = data?.findScenes;
    const scenes = Array.isArray(payload?.scenes) ? payload.scenes : [];

    // console.log(LOG_PREFIX, "Summary", { count: payload?.count, returned: scenes.length });

    const allFiles = scenes.flatMap((scene) => {
      const sceneId = scene?.id != null ? String(scene.id) : "";
      const files = Array.isArray(scene?.files) ? scene.files : [];
      return files.map((f) => ({ sceneId, ...f }));
    });

    // console.log(LOG_PREFIX, "Files (raw)", allFiles);

    console.table(
      allFiles.map((f) => ({
        sceneId: f.sceneId,
        id: f.id,
        path: f.path || f.basename || "",
        duration: f.duration,
        size: f.size,
        resolution: f.width && f.height ? `${f.width}x${f.height}` : "",
        bit_rate: f.bit_rate,
        video_codec: f.video_codec,
        audio_codec: f.audio_codec,
        frame_rate: f.frame_rate,
        format: f.format,
        created_at: f.created_at,
        updated_at: f.updated_at,
      }))
    );

    // Simple: build the exact table-row markup as a string and print it.
    let rowsHtml = "";
    swmfSceneFilesBySceneId = new Map();
    for (const scene of scenes) {
      const sceneId = scene?.id != null ? String(scene.id) : "";
      const sceneTitle = scene?.title != null ? String(scene.title) : "";
      const files = Array.isArray(scene?.files) ? scene.files : [];
      if (!sceneId || files.length === 0) continue;

      swmfSceneFilesBySceneId.set(sceneId, files.map((f) => String(f?.id)).filter(Boolean));

      for (let i = 0; i < files.length; i++) {
        rowsHtml += fileRowHtml({ sceneId, sceneTitle, file: files[i], isFirstRowForScene: i === 0 });
        rowsHtml += "\n";
      }

      rowsHtml += separatorRowHtml();
      rowsHtml += "\n";
    }

    window.swScenesWithMultipleFilesHtml = rowsHtml;
    console.log(LOG_PREFIX, "Generated HTML tbody (also in window.swScenesWithMultipleFilesHtml)");
    console.log(rowsHtml);

    const host = await waitForElement(".duplicate-checker-table");
    if (!host) {
      console.warn(LOG_PREFIX, "No .duplicate-checker-table found after waiting; not appending");
      return data;
    }

    const isTable = String(host.tagName || "").toLowerCase() === "table";
    const tbody = String(host.tagName || "").toLowerCase() === "tbody"
      ? host
      : host.querySelector("tbody") || (isTable ? host.createTBody() : null);
    const target = tbody || host;

    if (!window.__swmfDeleteHandlerInstalled) {
      window.__swmfDeleteHandlerInstalled = true;
      document.addEventListener("click", async (e) => {
        const btn = e.target && e.target.closest ? e.target.closest("button.swmf-delete") : null;
        if (!btn) return;
        const fileId = btn.getAttribute("data-swmf-file-id");
        if (!fileId) return;
        const sceneId = btn.getAttribute("data-swmf-scene-id") || "";

        console.log(LOG_PREFIX, "Delete clicked", { fileId });

        e.preventDefault();
        e.stopPropagation();
        if (REQUIRE_DELETE_CONFIRM && !e.shiftKey) {
          const ok = typeof confirm === "function" ? confirm(`Delete file ${fileId}?`) : true;
          console.log(LOG_PREFIX, "Delete confirm", { fileId, ok });
          if (!ok) return;
        } else {
          console.log(LOG_PREFIX, "Delete confirm skipped", { fileId, shiftKey: !!e.shiftKey });
        }

        btn.disabled = true;
        try {
          console.log(LOG_PREFIX, "Delete mutation starting", { fileId });
          await deleteFileById(fileId, sceneId);
          console.log(LOG_PREFIX, "Delete mutation finished", { fileId });
          const row = btn.closest("tr");
          if (row) row.remove();
        } catch (err) {
          console.error(LOG_PREFIX, "Delete failed", err);
          alert(`Delete failed: ${err?.message || err}\n\nIf this file is the scene's primary file, Stash may require switching primary to another file first.`);
        } finally {
          btn.disabled = false;
        }
      });
    }

    if (target.dataset.swmfAppended !== "true") {
      target.insertAdjacentHTML("beforeend", rowsHtml);
      target.dataset.swmfAppended = "true";
    }

    return data;
  }

  // let lastScenes = null;
  // let injecting = false;
  // let reinjectTimer = 0;




  // Auto-run once on the duplicate checker page.
  run().catch((err) => {
    console.error(LOG_PREFIX, "Query failed", err);
  });

  // // React can re-render and wipe injected DOM; re-inject on table changes.
  // const bodyObserver = new MutationObserver(() => {
  //   if (!isOnDuplicateChecker()) return;
  //   if (!lastScenes || !lastScenes.length) return;
  //   if (reinjectTimer) clearTimeout(reinjectTimer);
  //   reinjectTimer = setTimeout(() => injectIntoPage({ scenes: lastScenes }), 250);
  // });
  // bodyObserver.observe(document.body, { childList: true, subtree: true });
})();

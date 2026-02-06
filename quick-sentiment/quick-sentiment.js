(() => {
  (function() {
    const INSTALL_FLAG = "__quick_sentiment_installed__";
    if (window[INSTALL_FLAG]) return;
    window[INSTALL_FLAG] = true;

    function init(attempt = 0) {
      const PluginApi = window.PluginApi;
      if (!PluginApi || !PluginApi.React || !PluginApi.patch || !PluginApi.utils || !PluginApi.utils.StashService) {
        if (attempt < 60) return setTimeout(() => init(attempt + 1), 200);
        console.warn("[QuickSentiment] PluginApi not available; aborting init");
        return;
      }

      const React = PluginApi.React;
      const { Button } = PluginApi.libraries.Bootstrap;
      const { faHeart, faClock } = PluginApi.libraries.FontAwesomeSolid;
      const { Icon } = PluginApi.components;

      function isNumericId(v) {
        return /^\d+$/.test(String(v || "").trim());
      }

      async function gql(query, variables) {
        const response = await fetch("/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, variables })
        });
        const json = await response.json();
        if (json.errors && json.errors.length) {
          const msg = json.errors.map((e) => e.message).filter(Boolean).join("; ");
          throw new Error(msg || "GraphQL error");
        }
        return json.data;
      }

      const tagIdCache = /* @__PURE__ */ new Map();
      const tagIdInFlight = /* @__PURE__ */ new Map();

      async function resolveTagId(tagIdOrName) {
        const raw = String(tagIdOrName || "").trim();
        if (!raw) return "";
        if (isNumericId(raw)) return raw;
        const key = raw.toLowerCase();
        if (tagIdCache.has(key)) return tagIdCache.get(key);
        if (tagIdInFlight.has(key)) return await tagIdInFlight.get(key);

        const p = (async () => {
          const query = `
            query QuickSentimentFindTags($tag_filter: TagFilterType, $filter: FindFilterType) {
              findTags(tag_filter: $tag_filter, filter: $filter) {
                tags { id name }
              }
            }
          `;

          const variablesEquals = {
            tag_filter: { name: { value: raw, modifier: "EQUALS" } },
            filter: { per_page: 5, sort: "name", direction: "ASC" }
          };

          try {
            const data = await gql(query, variablesEquals);
            const tags = data?.findTags?.tags;
            const list = Array.isArray(tags) ? tags : [];
            const needle = raw.toLowerCase();
            const hit = list.find((t) => String(t?.name || "").trim().toLowerCase() === needle);
            const id = hit?.id != null ? String(hit.id) : "";

            // If EQUALS is supported but returned nothing, fall back to INCLUDES and filter client-side.
            if (!id) {
              const variablesIncludes = {
                tag_filter: { name: { value: raw, modifier: "INCLUDES" } },
                filter: { per_page: 50, sort: "name", direction: "ASC" }
              };
              const data2 = await gql(query, variablesIncludes);
              const tags2 = data2?.findTags?.tags;
              const list2 = Array.isArray(tags2) ? tags2 : [];
              const hit2 = list2.find((t) => String(t?.name || "").trim().toLowerCase() === needle);
              const id2 = hit2?.id != null ? String(hit2.id) : "";
              tagIdCache.set(key, id2);
              return id2;
            }

            tagIdCache.set(key, id);
            return id;
          } catch (err) {
            // Back-compat: if EQUALS modifier isn't supported, fall back to INCLUDES and filter client-side.
            const msg = String(err?.message || err);
            const looksLikeFilterUnsupported = /(unknown|not defined|cannot query|field|argument|input|enum)/i.test(msg);
            if (!looksLikeFilterUnsupported) throw err;

            const variablesIncludes = {
              tag_filter: { name: { value: raw, modifier: "INCLUDES" } },
              filter: { per_page: 50, sort: "name", direction: "ASC" }
            };
            const data = await gql(query, variablesIncludes);
            const tags = data?.findTags?.tags;
            const list = Array.isArray(tags) ? tags : [];
            const needle = raw.toLowerCase();
            const hit = list.find((t) => String(t?.name || "").trim().toLowerCase() === needle);
            const id = hit?.id != null ? String(hit.id) : "";
            tagIdCache.set(key, id);
            return id;
          }
        })();

        tagIdInFlight.set(key, p);
        try {
          return await p;
        } finally {
          tagIdInFlight.delete(key);
        }
      }

      function useResolvedTagId(tagIdOrName) {
        const raw = String(tagIdOrName || "").trim();
        const [resolved, setResolved] = React.useState(() => (isNumericId(raw) ? raw : ""));

        React.useEffect(() => {
          let cancelled = false;
          const current = String(tagIdOrName || "").trim();
          if (!current) {
            setResolved("");
            return;
          }
          if (isNumericId(current)) {
            setResolved(current);
            return;
          }
          setResolved("");
          resolveTagId(current)
            .then((id) => {
              if (cancelled) return;
              setResolved(String(id || ""));
            })
            .catch((err) => {
              if (cancelled) return;
              console.warn("[QuickSentiment] Failed to resolve tag", current, err);
              setResolved("");
            });
          return () => {
            cancelled = true;
          };
        }, [tagIdOrName]);

        return resolved;
      }

      function normalizeKey(s) {
        return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      }

      function getPluginSettingsFromConfigurationData(data) {
        const plugins = data?.configuration?.plugins || {};
        const directKeys = ["quickSentiment", "quick-sentiment", "quick_sentiment", "Quick Sentiment", "quick sentiment"];
        for (const k of directKeys) {
          if (plugins && Object.prototype.hasOwnProperty.call(plugins, k)) return plugins[k] || {};
        }
        const wanted = normalizeKey("quickSentiment");
        for (const k of Object.keys(plugins || {})) {
          if (normalizeKey(k) === wanted) return plugins[k] || {};
        }
        return {};
      }

    function useToggleTag() {
      const [updateScene] = PluginApi.utils.StashService.useSceneUpdate();
      const toggleTag = React.useCallback(async (scene, tagIdOrName) => {
        const wantedRaw = String(tagIdOrName || "").trim();
        if (!wantedRaw) return;

        let wantedId = wantedRaw;
        if (!isNumericId(wantedId)) {
          try {
            wantedId = await resolveTagId(wantedRaw);
          } catch (err) {
            console.warn("[QuickSentiment] Failed to resolve tag", wantedRaw, err);
            return;
          }
        }
        wantedId = String(wantedId || "").trim();
        if (!wantedId || !isNumericId(wantedId)) {
          console.warn("[QuickSentiment] Tag not found:", wantedRaw);
          return;
        }
        const sceneTags = Array.isArray(scene?.tags) ? scene.tags : [];
        const favoriteTag = sceneTags.find((tag) => String(tag?.id) === wantedId);
        let tags = sceneTags.map((tag) => tag.id);
        if (favoriteTag) {
          tags = tags.filter((id) => String(id) !== wantedId);
        } else {
          tags.push(wantedId);
        }
        updateScene({
          variables: {
            input: {
              id: scene.id,
              tag_ids: tags
            }
          }
        });
      }, [updateScene]);
      return toggleTag;
    }
    const FavoriteIcon = ({ value: favorite, onToggle: onToggleFavorite }) => {
      return /* @__PURE__ */ React.createElement(
        Button,
        {
          className: `minimal favorite-button ${favorite ? "favorite" : "not-favorite"} `,
          onClick: () => onToggleFavorite(!favorite)
        },
        /* @__PURE__ */ React.createElement(Icon, { icon: faHeart })
      );
    };
    const WatchLaterIcon = ({ value: favorite, onToggle: onToggleFavorite }) => {
      return /* @__PURE__ */ React.createElement(
        Button,
        {
          className: `minimal favorite-button ${favorite ? "watch-later" : "not-favorite"} `,
          onClick: () => onToggleFavorite(!favorite)
        },
        /* @__PURE__ */ React.createElement(Icon, { icon: faClock })
      );
    };
    const Overlays = ({ scene }) => {
      const { data } = PluginApi.utils.StashService.useConfiguration();
      const settings = getPluginSettingsFromConfigurationData(data);
      const favoriteTagRaw = settings?.favouriteTag ?? "";
      const watchLaterTagRaw = settings?.watchLaterTag ?? "";

      const favoriteTagId = useResolvedTagId(favoriteTagRaw);
      const watchLaterTagId = useResolvedTagId(watchLaterTagRaw);
      const toggleTag = useToggleTag();
      const favorite = React.useMemo(() => {
        const tags = Array.isArray(scene?.tags) ? scene.tags : [];
        return !!favoriteTagId && tags.some((tag) => String(tag?.id) === String(favoriteTagId));
      }, [scene, favoriteTagId]);
      const watchLater = React.useMemo(() => {
        const tags = Array.isArray(scene?.tags) ? scene.tags : [];
        return !!watchLaterTagId && tags.some((tag) => String(tag?.id) === String(watchLaterTagId));
      }, [scene, watchLaterTagId]);
      if (!favoriteTagRaw && !watchLaterTagRaw) return null;
      return /* @__PURE__ */ React.createElement(
        "span",
        { className: "plugin-quick-sentiment" },
        favoriteTagRaw && /* @__PURE__ */ React.createElement(FavoriteIcon, {
          value: favorite,
          onToggle: (v) => toggleTag(scene, favoriteTagRaw)
        }),
        watchLaterTagRaw && /* @__PURE__ */ React.createElement(WatchLaterIcon, {
          value: watchLater,
          onToggle: (v) => toggleTag(scene, watchLaterTagRaw)
        })
      );
    };

      function patchOverlays(...args) {
        const props = args?.[0] || {};
        const Original = typeof args?.[2] === "function" ? args[2] : typeof args?.[1] === "function" ? args[1] : null;
        if (!Original) return null;
        const scene = props?.scene;
        return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Original, { ...props }), /* @__PURE__ */ React.createElement(Overlays, { scene }));
      }

      try {
        PluginApi.patch.instead("SceneCard.Overlays", patchOverlays);
      } catch (err) {
        console.warn("[QuickSentiment] Failed to patch SceneCard.Overlays", err);
      }
    }

    init();
  })();
})();

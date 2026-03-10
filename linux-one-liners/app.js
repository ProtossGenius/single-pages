(function () {
  const SCRIPT_LIST = Array.isArray(window.SCRIPT_LIST) ? window.SCRIPT_LIST : [];
  const SCRIPT_TYPE_OPTIONS = Array.isArray(window.SCRIPT_TYPE_OPTIONS) ? window.SCRIPT_TYPE_OPTIONS : [];

  const searchInput = document.getElementById("searchInput");
  const cardGrid = document.getElementById("cardGrid");
  const resultTip = document.getElementById("resultTip");
  const emptyState = document.getElementById("emptyState");

  if (!searchInput || !cardGrid || !resultTip || !emptyState) {
    return;
  }

  const scriptMap = new Map(SCRIPT_LIST.map((item) => [item.id, item]));
  const cardState = new Map();
  const copyTimerMap = new Map();

  hydrateState();

  let normalized = SCRIPT_LIST.map((script) => buildSearchDoc(script));
  let fuse = createFuse(normalized);

  init();

  function init() {
    const initQuery = new URLSearchParams(window.location.search).get("q") || "";
    searchInput.value = initQuery;
    renderByQuery(initQuery);

    searchInput.addEventListener("input", (event) => {
      const query = event.target.value;
      renderByQuery(query);
      syncQuery(query);
    });

    cardGrid.addEventListener("input", onCardInput);
    cardGrid.addEventListener("change", onCardInput);
    cardGrid.addEventListener("click", onCardClick);

    injectStructuredData();
  }

  function hydrateState() {
    SCRIPT_LIST.forEach((script) => {
      const params = {};
      (script.params || []).forEach((param) => {
        params[param.key] = String(param.defaultValue == null ? "" : param.defaultValue);
      });

      const availableTypes = getTypeOptions(script).map((item) => item.value);
      const defaultType = availableTypes.includes(script.defaultType) ? script.defaultType : availableTypes[0] || "plaintext";

      cardState.set(script.id, {
        type: defaultType,
        params
      });
    });
  }

  function createFuse(list) {
    if (!window.Fuse) {
      return null;
    }

    return new window.Fuse(list, {
      includeScore: true,
      shouldSort: true,
      ignoreLocation: true,
      threshold: 0.42,
      keys: [
        { name: "title", weight: 0.32 },
        { name: "description", weight: 0.26 },
        { name: "keywordText", weight: 0.35 },
        { name: "typeText", weight: 0.07 }
      ]
    });
  }

  function buildSearchDoc(script) {
    const keywordText = (script.keywords || []).join(" ");
    const typeText = getTypeOptions(script).map((item) => item.label).join(" ");
    const rawText = `${script.title || ""} ${script.description || ""} ${keywordText} ${typeText}`;
    const pinyinInfo = toPinyin(rawText);

    return {
      ...script,
      keywordText,
      typeText,
      normalizedText: normalize(rawText),
      normalizedTitle: normalize(script.title),
      normalizedKeywords: normalize(keywordText),
      pinyinFull: pinyinInfo.full,
      pinyinInitial: pinyinInfo.initial
    };
  }

  function toPinyin(text) {
    if (!window.pinyinPro || typeof window.pinyinPro.pinyin !== "function") {
      return { full: "", initial: "" };
    }

    try {
      const fullRaw = window.pinyinPro.pinyin(text, { toneType: "none" });
      const fullText = Array.isArray(fullRaw) ? fullRaw.join("") : String(fullRaw);
      const initialRaw = window.pinyinPro.pinyin(text, { pattern: "first", toneType: "none" });

      return {
        full: normalize(fullText),
        initial: normalize(initialRaw)
      };
    } catch (error) {
      return { full: "", initial: "" };
    }
  }

  function normalize(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFKC")
      .replace(/[\s_\-./:]+/g, "")
      .trim();
  }

  function subsequenceScore(query, target) {
    if (!query || !target) {
      return 0;
    }

    if (target.includes(query)) {
      return 1;
    }

    let qIndex = 0;
    let streak = 0;
    let bestStreak = 0;
    let gaps = 0;

    for (let i = 0; i < target.length && qIndex < query.length; i += 1) {
      if (target[i] === query[qIndex]) {
        qIndex += 1;
        streak += 1;
        if (streak > bestStreak) {
          bestStreak = streak;
        }
      } else {
        if (streak > 0) {
          gaps += 1;
        }
        streak = 0;
      }
    }

    if (qIndex !== query.length) {
      return 0;
    }

    const coverage = query.length / target.length;
    const continuity = bestStreak / query.length;
    const gapPenalty = Math.min(0.35, gaps / (target.length + 1));

    return Math.max(0.12, 0.45 + coverage * 0.35 + continuity * 0.3 - gapPenalty);
  }

  function searchScripts(query) {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) {
      return normalized.map((item) => ({ item, score: 1 }));
    }

    const scoreMap = new Map();

    if (fuse) {
      fuse.search(query).forEach((result) => {
        const fuseScore = 1 - (result.score || 1);
        scoreMap.set(result.item.id, Math.max(scoreMap.get(result.item.id) || 0, fuseScore));
      });
    }

    normalized.forEach((item) => {
      const customScore = Math.max(
        subsequenceScore(normalizedQuery, item.normalizedText),
        subsequenceScore(normalizedQuery, item.normalizedTitle),
        subsequenceScore(normalizedQuery, item.normalizedKeywords),
        subsequenceScore(normalizedQuery, item.pinyinFull),
        subsequenceScore(normalizedQuery, item.pinyinInitial)
      );

      if (customScore > 0) {
        scoreMap.set(item.id, Math.max(scoreMap.get(item.id) || 0, customScore));
      }
    });

    return normalized
      .filter((item) => scoreMap.has(item.id))
      .map((item) => ({ item, score: scoreMap.get(item.id) || 0 }))
      .sort((a, b) => b.score - a.score);
  }

  function renderByQuery(query) {
    const results = searchScripts(query);
    renderCards(results.map((entry) => entry.item));

    const normalizedQuery = normalize(query);
    if (!normalizedQuery) {
      resultTip.textContent = `共 ${SCRIPT_LIST.length} 条脚本。`;
    } else {
      resultTip.textContent = `关键词“${query}”匹配到 ${results.length} 条脚本。`;
    }

    emptyState.hidden = results.length !== 0;
  }

  function renderCards(list) {
    cardGrid.innerHTML = list.map((script) => buildCardHtml(script)).join("");

    list.forEach((script) => {
      const card = cardGrid.querySelector(`[data-script-card="${escapeAttr(script.id)}"]`);
      if (!card) {
        return;
      }
      refreshCardPreview(card, script);
    });
  }

  function buildCardHtml(script) {
    const state = cardState.get(script.id) || { params: {}, type: script.defaultType || "plaintext" };
    const tags = (script.keywords || []).slice(0, 5).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
    const typeOptions = getTypeOptions(script)
      .map((option) => {
        const selected = option.value === state.type ? " selected" : "";
        return `<option value="${escapeAttr(option.value)}"${selected}>${escapeHtml(option.label)}</option>`;
      })
      .join("");

    const paramFields = (script.params || [])
      .map((param) => {
        const value = state.params[param.key] == null ? "" : String(state.params[param.key]);
        return `
          <div class="form-field">
            <label for="${escapeAttr(`${script.id}-${param.key}`)}">${escapeHtml(param.label)}</label>
            <input
              id="${escapeAttr(`${script.id}-${param.key}`)}"
              data-script-id="${escapeAttr(script.id)}"
              data-param-key="${escapeAttr(param.key)}"
              type="${escapeAttr(param.inputType || "text")}" 
              value="${escapeAttr(value)}"
              placeholder="${escapeAttr(param.placeholder || "")}" 
            />
            <small>${escapeHtml(param.description || "")}</small>
          </div>
        `;
      })
      .join("");

    return `
      <article class="script-card" data-script-card="${escapeAttr(script.id)}" role="listitem">
        <div class="card-head">
          <h2>${escapeHtml(script.title)}</h2>
          <p>${escapeHtml(script.description || "")}</p>
          <div class="card-tags">${tags}</div>
        </div>

        <div class="form-grid">
          <div class="form-field">
            <label for="${escapeAttr(`${script.id}-script-type`)}">脚本类型</label>
            <select id="${escapeAttr(`${script.id}-script-type`)}" data-script-id="${escapeAttr(script.id)}" data-role="script-type">
              ${typeOptions}
            </select>
            <small>影响代码块高亮方式。</small>
          </div>
          ${paramFields}
        </div>

        <div class="code-wrap">
          <pre class="script-code"><code data-role="script-code"></code></pre>
        </div>

        <div class="card-actions">
          <button class="copy-btn" type="button" data-script-id="${escapeAttr(script.id)}" data-role="copy-btn">复制脚本</button>
          <span class="copy-status" data-role="copy-status"></span>
        </div>
      </article>
    `;
  }

  function onCardInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const scriptId = target.getAttribute("data-script-id");
    if (!scriptId || !scriptMap.has(scriptId)) {
      return;
    }

    const state = cardState.get(scriptId);
    if (!state) {
      return;
    }

    if (target.getAttribute("data-role") === "script-type") {
      const nextType = target.value;
      const allowed = getTypeOptions(scriptMap.get(scriptId)).map((item) => item.value);
      state.type = allowed.includes(nextType) ? nextType : state.type;
    }

    const paramKey = target.getAttribute("data-param-key");
    if (paramKey) {
      state.params[paramKey] = target.value;
    }

    const card = target.closest("[data-script-card]");
    if (!card) {
      return;
    }

    refreshCardPreview(card, scriptMap.get(scriptId));
  }

  async function onCardClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.getAttribute("data-role") !== "copy-btn") {
      return;
    }

    const scriptId = target.getAttribute("data-script-id");
    if (!scriptId || !scriptMap.has(scriptId)) {
      return;
    }

    const text = composeScript(scriptMap.get(scriptId), cardState.get(scriptId));
    const card = target.closest("[data-script-card]");
    if (!card) {
      return;
    }

    const copied = await copyText(text);
    if (copied) {
      showCopyStatus(card, "已复制替换后的脚本", true, scriptId);
    } else {
      showCopyStatus(card, "复制失败，请手动复制", false, scriptId);
    }
  }

  function refreshCardPreview(card, script) {
    const code = card.querySelector('[data-role="script-code"]');
    if (!code) {
      return;
    }

    const state = cardState.get(script.id);
    const text = composeScript(script, state);
    code.textContent = text;

    const language = toHighlightLanguage(state && state.type ? state.type : "plaintext");
    code.className = `language-${language}`;

    if (window.hljs && typeof window.hljs.highlightElement === "function") {
      window.hljs.highlightElement(code);
    }
  }

  function composeScript(script, state) {
    const params = state && state.params ? state.params : {};
    return String(script.template || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
      if (params[key] == null || params[key] === "") {
        const param = (script.params || []).find((item) => item.key === key);
        return param && param.defaultValue != null ? String(param.defaultValue) : "";
      }
      return String(params[key]);
    });
  }

  function toHighlightLanguage(type) {
    const map = {
      bash: "bash",
      python: "python",
      nginx: "nginx",
      plaintext: "plaintext"
    };

    return map[type] || "plaintext";
  }

  function getTypeOptions(script) {
    const typeMap = new Map(SCRIPT_TYPE_OPTIONS.map((item) => [item.value, item.label]));
    const rawTypes = Array.isArray(script.types) && script.types.length ? script.types : [script.defaultType || "plaintext"];

    return rawTypes.map((type) => ({
      value: type,
      label: typeMap.get(type) || type
    }));
  }

  function showCopyStatus(card, message, isOk, scriptId) {
    const el = card.querySelector('[data-role="copy-status"]');
    if (!el) {
      return;
    }

    el.textContent = message;
    el.classList.toggle("ok", Boolean(isOk));

    const timer = copyTimerMap.get(scriptId);
    if (timer) {
      window.clearTimeout(timer);
    }

    const nextTimer = window.setTimeout(() => {
      el.textContent = "";
      el.classList.remove("ok");
      copyTimerMap.delete(scriptId);
    }, 1800);

    copyTimerMap.set(scriptId, nextTimer);
  }

  async function copyText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        return fallbackCopy(text);
      }
    }

    return fallbackCopy(text);
  }

  function fallbackCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();

    let success = false;
    try {
      success = document.execCommand("copy");
    } catch (error) {
      success = false;
    }

    textarea.remove();
    return success;
  }

  function syncQuery(query) {
    const url = new URL(window.location.href);
    const clean = query.trim();

    if (clean) {
      url.searchParams.set("q", clean);
    } else {
      url.searchParams.delete("q");
    }

    window.history.replaceState(null, "", url.pathname + url.search);
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(text) {
    return escapeHtml(text);
  }

  function injectStructuredData() {
    const script = document.createElement("script");
    script.type = "application/ld+json";

    const currentPageUrl = new URL("./", window.location.href).href;
    const graph = [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Linux 一句话脚本库",
        inLanguage: "zh-CN",
        url: currentPageUrl,
        description: "Linux 常用 one-liner 脚本集合，支持参数替换与复制。",
        potentialAction: {
          "@type": "SearchAction",
          target: `${currentPageUrl}?q={search_term_string}`,
          "query-input": "required name=search_term_string"
        }
      },
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Linux 脚本列表",
        itemListElement: SCRIPT_LIST.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: item.title,
          description: item.description
        }))
      }
    ];

    script.textContent = JSON.stringify(graph);
    document.head.appendChild(script);
  }
})();
